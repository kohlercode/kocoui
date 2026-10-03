<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Config;
use KocoUI\DeletedSessions;
use KocoUI\Files;
use KocoUI\Hermes\HermesClient;
use KocoUI\Push\RunWatcher;
use KocoUI\Session;
use KocoUI\Uploads;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;

final class ChatController
{
    private const STREAM_SECONDS = 50;
    private const APPROVAL_CHOICES = ['once', 'session', 'always', 'deny'];
    /** Also parsed by the frontend to show attachments instead of the raw paths. */
    public const ATTACHMENT_HEADER = '[Attached files]';

    public static function capabilities(Request $req): never
    {
        $caps = (new HermesClient())->capabilities();
        Response::json([
            'features' => $caps['features'] ?? [],
            'files' => [
                'max_upload_bytes' => FilesController::maxBytes(),
                'max_per_message' => (int) Config::get('files.max_per_message', 10),
            ],
        ]);
    }

    public static function sessions(Request $req): never
    {
        $limit = max(1, min(200, (int) ($req->query['limit'] ?? 50)));
        $offset = max(0, (int) ($req->query['offset'] ?? 0));
        $client = new HermesClient();
        $res = $client->sessions($limit, $offset);
        $deleted = DeletedSessions::recent();
        if ($deleted && is_array($res['data'] ?? null)) {
            $keep = [];
            foreach ($res['data'] as $s) {
                $id = is_array($s) ? (string) ($s['id'] ?? '') : '';
                if (!isset($deleted[$id])) {
                    $keep[] = $s;
                    continue;
                }
                try {
                    $client->deleteSession($id);
                } catch (HttpError) {
                    // Hidden either way; the next listing retries.
                }
            }
            $res['data'] = $keep;
        }
        Response::json($res);
    }

    public static function messages(Request $req, array $p): never
    {
        Response::json((new HermesClient())->messages(self::sessionId($p['id'])));
    }

    public static function rename(Request $req, array $p): never
    {
        $title = trim($req->string('title', 200));
        if ($title === '') {
            throw new HttpError(400, 'invalid_input', 'Title must not be empty');
        }
        Response::json((new HermesClient())->renameSession(self::sessionId($p['id']), $title));
    }

    public static function delete(Request $req, array $p): never
    {
        $id = self::sessionId($p['id']);
        $res = (new HermesClient())->deleteSession($id);
        DeletedSessions::add($id);
        Uploads::removeForSession($id);
        Response::json($res);
    }

    public static function fork(Request $req, array $p): never
    {
        Response::json((new HermesClient())->fork(self::sessionId($p['id'])));
    }

    public static function startRun(Request $req): never
    {
        $input = trim($req->string('input', 100000));
        $attachmentIds = self::attachmentIds($req->json()['attachments'] ?? []);
        if ($input === '' && !$attachmentIds) {
            throw new HttpError(400, 'invalid_input', 'Message must not be empty');
        }
        $sessionId = $req->string('session_id', 128);
        $sessionId = $sessionId === ''
            ? 'web_' . gmdate('Ymd_His') . '_' . bin2hex(random_bytes(3))
            : self::sessionId($sessionId);
        $key = $req->header('Idempotency-Key') ?? '';
        if (!preg_match('/^[A-Za-z0-9-]{16,64}$/', $key)) {
            throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key header (UUID) is required');
        }
        if ($attachmentIds) {
            $lines = [];
            foreach (Uploads::claim($attachmentIds, (int) Session::userId(), $sessionId) as $u) {
                $lines[] = sprintf('- %s (%s, %s)', Files::inbox() . '/' . $u['rel_path'], $u['mime'], Files::humanSize((int) $u['size']));
            }
            $input = ltrim($input . "\n\n" . self::ATTACHMENT_HEADER . "\n" . implode("\n", $lines));
        }
        $res = (new HermesClient())->run($input, $sessionId, $key, self::model($req->string('model', 300)), self::instructions($sessionId));
        $payload = [
            'run_id' => $res['run_id'] ?? null,
            'status' => $res['status'] ?? null,
            'replayed' => $res['replayed'] ?? false,
            'session_id' => $sessionId,
        ];
        // Finish the HTTP response before watching so closed tabs still get push.
        http_response_code(202);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $runId = is_string($payload['run_id'] ?? null) ? $payload['run_id'] : '';
        $uid = Session::userId();
        if ($runId !== '' && $uid !== null && empty($payload['replayed'])) {
            RunWatcher::maybeWatch($runId, $uid, $sessionId);
        }
        exit;
    }

    public static function runStatus(Request $req, array $p): never
    {
        Response::json((new HermesClient())->runStatus($p['id']));
    }

    public static function runEvents(Request $req, array $p): never
    {
        $lastSeq = -1;
        $raw = $req->header('Last-Event-ID') ?? ($req->query['last_seq'] ?? null);
        if (is_string($raw) && ctype_digit($raw)) {
            $lastSeq = (int) $raw;
        }

        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        http_response_code(200);
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Accel-Buffering: no');
        // EventSource retries after this many ms when the 50 s window closes.
        echo "retry: 500\n\n";
        flush();

        $status = (new HermesClient())->runEvents($p['id'], $lastSeq, self::STREAM_SECONDS, static function (string $chunk): void {
            echo $chunk;
            flush();
        });
        if ($status !== 200) {
            // Not streamable (404 once finished and retired): the client stops reconnecting and polls.
            echo "event: gone\ndata: " . json_encode(['status' => $status]) . "\n\n";
            flush();
        }
        exit;
    }

    public static function approve(Request $req, array $p): never
    {
        $choice = $req->string('choice', 16);
        if (!in_array($choice, self::APPROVAL_CHOICES, true)) {
            throw new HttpError(400, 'invalid_approval_choice', 'Choice must be once, session, always or deny');
        }
        $requestId = $req->string('request_id', 256);
        Response::json((new HermesClient())->approve($p['id'], $choice, $requestId));
    }

    public static function steer(Request $req, array $p): never
    {
        $text = trim($req->string('input', 20000));
        if ($text === '') {
            throw new HttpError(400, 'invalid_input', 'Steer text must not be empty');
        }
        Response::json((new HermesClient())->steer($p['id'], $text));
    }

    public static function stop(Request $req, array $p): never
    {
        Response::json((new HermesClient())->stop($p['id']));
    }

    /** @return list<string> */
    private static function attachmentIds(mixed $value): array
    {
        $max = (int) Config::get('files.max_per_message', 10);
        if (!is_array($value) || count($value) > $max) {
            throw new HttpError(400, 'invalid_attachment', "Up to $max attachments per message");
        }
        $ids = [];
        foreach ($value as $id) {
            if (!is_string($id) || !preg_match('/^[a-f0-9]{16}$/', $id)) {
                throw new HttpError(400, 'invalid_attachment', 'Invalid attachment id');
            }
            $ids[$id] = true;
        }
        return array_keys($ids);
    }

    /** Per-run system prompt addition (Hermes appends it): where this conversation's deliverables go. */
    private static function instructions(string $sessionId): ?string
    {
        if ($sessionId === '.' || $sessionId === '..') {
            return null;
        }
        return sprintf(
            'Files you send to the user in this conversation go into %s/%s/ (create it if needed), referenced as MEDIA:<absolute path>.',
            Files::outbox(), $sessionId,
        );
    }

    /**
     * "provider::model" as listed by /api/models, or "" for the gateway default.
     * Hermes only serves providers it holds credentials for.
     *
     * @return array{provider:string,model:string}|null
     */
    private static function model(string $value): ?array
    {
        if ($value === '') {
            return null;
        }
        if (!preg_match('#^([A-Za-z0-9_.-]{2,64})::([A-Za-z0-9._:/@+-]{1,200})$#', $value, $m)) {
            throw new HttpError(400, 'invalid_model', 'Invalid model');
        }
        return ['provider' => $m[1], 'model' => $m[2]];
    }

    private static function sessionId(string $id): string
    {
        if (!preg_match('/^[A-Za-z0-9._:-]{1,128}$/', $id)) {
            throw new HttpError(400, 'invalid_session_id', 'Invalid session id');
        }
        return $id;
    }
}
