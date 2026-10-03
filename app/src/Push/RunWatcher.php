<?php
declare(strict_types=1);

namespace KocoUI\Push;

use KocoUI\Config;
use KocoUI\Hermes\HermesClient;
use KocoUI\Http\HttpError;

/**
 * After POST /api/runs returns, poll Hermes until the turn ends and push on
 * approval / terminal status. Only runs when the user has subscriptions.
 */
final class RunWatcher
{
    private const TERMINAL = ['completed', 'failed', 'cancelled', 'interrupted'];

    public static function maybeWatch(string $runId, int $userId, string $sessionId): void
    {
        if ($runId === '' || !Notifier::enabled() || Subscriptions::countForUser($userId) === 0) {
            return;
        }
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }
        ignore_user_abort(true);
        @set_time_limit(900);
        self::watch($runId, $userId, $sessionId);
    }

    public static function watch(string $runId, int $userId, string $sessionId): void
    {
        $client = new HermesClient();
        $app = (string) Config::get('app_name', 'Hermes');
        $url = Notifier::sessionUrl($sessionId);
        $deadline = time() + 840; // leave headroom under FPM's 900 s cap
        $interval = 2;

        while (time() < $deadline) {
            try {
                $st = $client->runStatus($runId);
            } catch (HttpError $e) {
                if ($e->status === 404) {
                    return;
                }
                sleep($interval);
                continue;
            }

            $status = (string) ($st['status'] ?? '');
            if ($status === 'waiting_for_approval') {
                $reqId = (string) ($st['approval']['request_id'] ?? $st['approval']['id'] ?? 'pending');
                Notifier::once($userId, $runId, 'approval:' . $reqId, [
                    'title' => $app,
                    'body' => 'Approval needed',
                    'url' => $url,
                    'tag' => 'approval-' . $runId,
                    'urgency' => 'high',
                ]);
            } elseif (in_array($status, self::TERMINAL, true)) {
                $body = match ($status) {
                    'completed' => 'Reply ready',
                    'failed' => 'Run failed',
                    'cancelled' => 'Run cancelled',
                    default => 'Run interrupted',
                };
                Notifier::once($userId, $runId, 'terminal:' . $status, [
                    'title' => $app,
                    'body' => $body,
                    'url' => $url,
                    'tag' => 'run-' . $runId,
                    'urgency' => 'normal',
                ]);
                return;
            }
            sleep($interval);
        }
    }
}
