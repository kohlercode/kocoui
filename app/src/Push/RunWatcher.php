<?php
declare(strict_types=1);

namespace KocoUI\Push;

use KocoUI\Config;
use KocoUI\Hermes\HermesClient;
use KocoUI\Http\HttpError;

/**
 * One Hermes status poll for a queued run. The CLI timer calls this; a web
 * request only inserts the queue row.
 */
final class RunWatcher
{
    private const TERMINAL = ['completed', 'failed', 'cancelled', 'interrupted'];

    /**
     * One status poll for one queued run. Sends at most one push per (run_id, kind)
     * via Notifier::once(), which already de-duplicates.
     * @return string 'running'|'waiting_for_approval'|'completed'|'failed'|'cancelled'|'interrupted'|'gone'
     */
    public static function tick(string $runId, int $userId, string $sessionId): string
    {
        try {
            $timeout = (int) Config::get('hermes.push_watch_timeout', 10);
            $st = (new HermesClient())->runStatus($runId, $timeout > 0 ? $timeout : 10);
        } catch (HttpError $e) {
            if ($e->status === 404) {
                return 'gone';
            }
            error_log('kocoui push watch: ' . $e->getMessage());
            return 'running';
        } catch (\Throwable $e) {
            error_log('kocoui push watch: ' . $e->getMessage());
            return 'running';
        }

        $status = (string) ($st['status'] ?? '');
        $app = (string) Config::get('app_name', 'Hermes');
        $url = Notifier::sessionUrl($sessionId);
        if ($status === 'waiting_for_approval') {
            $reqId = (string) ($st['approval']['request_id'] ?? $st['approval']['id'] ?? 'pending');
            Notifier::once($userId, $runId, 'approval:' . $reqId, [
                'title' => $app,
                'body' => 'Approval needed',
                'url' => $url,
                'tag' => 'approval-' . $runId,
                'urgency' => 'high',
            ]);
            return 'waiting_for_approval';
        }
        if (in_array($status, self::TERMINAL, true)) {
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
            return $status;
        }
        return 'running';
    }
}
