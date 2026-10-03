<?php
declare(strict_types=1);

namespace KocoUI\Hermes;

use KocoUI\Config;
use KocoUI\Http\HttpError;

/**
 * The only client of the Hermes API server. Never logs the key or request bodies:
 * state.db already holds every prompt, a second copy in a log file is a leak.
 */
final class HermesClient
{
    private readonly string $base;
    private readonly string $key;

    public function __construct()
    {
        $this->base = rtrim((string) Config::get('hermes.base_url'), '/');
        $this->key = (string) Config::get('hermes.api_key');
    }

    /** @param array{provider:string,model:string}|null $model null = the gateway's configured default */
    public function run(string $input, string $sessionId, string $idempotencyKey, ?array $model = null, ?string $instructions = null): array
    {
        $body = ['input' => $input, 'session_id' => $sessionId];
        if ($instructions !== null) {
            $body['instructions'] = $instructions;
        }
        if ($model !== null) {
            $body['provider'] = $model['provider'];
            $body['model'] = $model['model'];
        }
        return $this->request('POST', '/v1/runs', $body, [
            'Idempotency-Key: ' . $idempotencyKey,
        ]);
    }

    public function runStatus(string $runId): array
    {
        return $this->request('GET', '/v1/runs/' . rawurlencode($runId));
    }

    public function approve(string $runId, string $choice, ?string $requestId = null): array
    {
        $body = ['choice' => $choice];
        if ($requestId !== null && $requestId !== '') {
            $body['request_id'] = $requestId;
        }
        return $this->request('POST', '/v1/runs/' . rawurlencode($runId) . '/approval', $body);
    }

    public function steer(string $runId, string $text): array
    {
        return $this->request('POST', '/v1/runs/' . rawurlencode($runId) . '/steer', ['input' => $text]);
    }

    public function stop(string $runId): array
    {
        return $this->request('POST', '/v1/runs/' . rawurlencode($runId) . '/stop', []);
    }

    public function sessions(int $limit = 50, int $offset = 0): array
    {
        return $this->request('GET', '/api/sessions?' . http_build_query(['limit' => $limit, 'offset' => $offset]));
    }

    public function messages(string $sessionId): array
    {
        return $this->request('GET', '/api/sessions/' . rawurlencode($sessionId) . '/messages?inline_images=false');
    }

    public function renameSession(string $sessionId, string $title): array
    {
        return $this->request('PATCH', '/api/sessions/' . rawurlencode($sessionId), ['title' => $title]);
    }

    public function deleteSession(string $sessionId): array
    {
        return $this->request('DELETE', '/api/sessions/' . rawurlencode($sessionId));
    }

    public function fork(string $sessionId): array
    {
        return $this->request('POST', '/api/sessions/' . rawurlencode($sessionId) . '/fork', []);
    }

    public function capabilities(): array
    {
        return $this->request('GET', '/v1/capabilities');
    }

    public function skills(): array
    {
        return $this->request('GET', '/v1/skills');
    }

    public function toolsets(): array
    {
        return $this->request('GET', '/v1/toolsets');
    }

    public function modelOptions(): array
    {
        return $this->request('GET', '/api/model/options');
    }

    public function jobs(): array
    {
        return $this->request('GET', '/api/jobs?include_disabled=true');
    }

    /** True when the gateway answers /health with HTTP 2xx. Does not throw on downtime. */
    public function healthy(): bool
    {
        $ch = curl_init($this->base . '/health');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        return $status >= 200 && $status < 300;
    }

    /**
     * Pass the run's SSE stream through to the client, byte for byte, for at most
     * $maxSeconds. The browser's EventSource reconnects with Last-Event-ID and the
     * Hermes replay buffer fills the gap, so no PHP worker is held indefinitely.
     *
     * @param callable(string):void $write receives raw SSE bytes
     * @return int HTTP status from Hermes (200, or 404 once the run is forgotten)
     */
    public function runEvents(string $runId, int $lastSeq, int $maxSeconds, callable $write): int
    {
        $url = $this->base . '/v1/runs/' . rawurlencode($runId) . '/events';
        $headers = ['Authorization: Bearer ' . $this->key, 'Accept: text/event-stream'];
        if ($lastSeq >= 0) {
            $headers[] = 'Last-Event-ID: ' . $lastSeq;
        }
        $status = 0;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => (int) Config::get('hermes.connect_timeout', 5),
            CURLOPT_TIMEOUT => $maxSeconds,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$status): int {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                    $status = (int) $m[1];
                }
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$status, $write): int {
                if ($status !== 200) {
                    return strlen($chunk);
                }
                $write($chunk);
                return connection_aborted() ? -1 : strlen($chunk);
            },
        ]);
        curl_exec($ch);
        $errno = curl_errno($ch);
        if ($status === 0 && $errno !== 0 && $errno !== CURLE_OPERATION_TIMEDOUT) {
            throw new HttpError(502, 'hermes_unreachable', 'The agent is not reachable');
        }
        return $status;
    }

    private function request(string $method, string $path, ?array $body = null, array $extraHeaders = []): array
    {
        $headers = array_merge([
            'Authorization: Bearer ' . $this->key,
            'Accept: application/json',
        ], $extraHeaders);
        $ch = curl_init($this->base . $path);
        $opts = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => (int) Config::get('hermes.connect_timeout', 5),
            CURLOPT_TIMEOUT => (int) Config::get('hermes.timeout', 600),
        ];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

        if ($raw === false || $status === 0) {
            throw new HttpError(502, 'hermes_unreachable', 'The agent is not reachable');
        }
        $data = json_decode((string) $raw, true);
        if ($status >= 200 && $status < 300) {
            return is_array($data) ? $data : [];
        }

        $err = is_array($data['error'] ?? null) ? $data['error'] : [];
        $code = (string) ($err['code'] ?? '');
        $message = (string) ($err['message'] ?? 'Agent error');
        if ($status === 401 || $status === 403) {
            error_log("kocoui: Hermes rejected the API key ($method " . strtok($path, '?') . ')');
            throw new HttpError(502, 'hermes_auth', 'The agent rejected the configured API key');
        }
        if ($status === 429) {
            throw new HttpError(429, 'hermes_busy', $message, ['retry_after' => 5]);
        }
        throw new HttpError($status >= 500 ? 502 : $status, $code !== '' ? $code : 'hermes_' . $status, $message);
    }
}
