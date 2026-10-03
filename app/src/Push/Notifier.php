<?php
declare(strict_types=1);

namespace KocoUI\Push;

use KocoUI\Config;
use KocoUI\Db;

/** Fan-out short, non-secret notifications to a user's push subscriptions. */
final class Notifier
{
    public static function enabled(): bool
    {
        return Vapid::configured();
    }

    /**
     * Send at most once per (run_id, kind). Returns true if a send was attempted.
     *
     * @param array{title:string,body:string,url?:string,tag?:string,urgency?:string} $message
     */
    public static function once(int $userId, string $runId, string $kind, array $message): bool
    {
        if (!self::enabled() || Subscriptions::countForUser($userId) === 0) {
            return false;
        }
        $pdo = Db::pdo();
        try {
            $st = $pdo->prepare('INSERT INTO push_sent (run_id, kind, sent_at) VALUES (?, ?, ?)');
            $st->execute([$runId, $kind, time()]);
        } catch (\PDOException) {
            return false; // already sent
        }
        if (random_int(1, 40) === 1) {
            $pdo->exec('DELETE FROM push_sent WHERE sent_at < ' . (time() - 7 * 86400));
        }
        self::sendToUser($userId, $message);
        return true;
    }

    /** @param array{title:string,body:string,url?:string,tag?:string,urgency?:string} $message */
    public static function sendToUser(int $userId, array $message): void
    {
        if (!self::enabled()) {
            return;
        }
        $app = (string) Config::get('app_name', 'Hermes');
        $payload = json_encode([
            'title' => $message['title'] !== '' ? $message['title'] : $app,
            'body' => $message['body'] ?? '',
            'url' => $message['url'] ?? ((string) Config::get('base_url') . '/'),
            'tag' => $message['tag'] ?? null,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $urgency = $message['urgency'] ?? 'normal';
        $ttl = $urgency === 'high' ? 300 : 86400;

        foreach (Subscriptions::forUser($userId) as $sub) {
            try {
                $status = WebPush::send($sub['endpoint'], $sub['p256dh'], $sub['auth'], $payload, $ttl, $urgency);
            } catch (\Throwable $e) {
                error_log('kocoui push send: ' . $e->getMessage());
                continue;
            }
            if ($status === 404 || $status === 410) {
                Subscriptions::deleteEndpoint($sub['endpoint']);
            } elseif ($status < 200 || $status >= 300) {
                error_log('kocoui push HTTP ' . $status);
            }
        }
    }

    public static function sessionUrl(string $sessionId): string
    {
        return rtrim((string) Config::get('base_url'), '/') . '/#/s/' . rawurlencode($sessionId);
    }
}
