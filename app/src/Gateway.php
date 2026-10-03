<?php
declare(strict_types=1);

namespace KocoUI;

use KocoUI\Hermes\HermesClient;
use KocoUI\Http\HttpError;

/**
 * Ask the host to restart the Hermes gateway. PHP cannot run systemctl (exec is
 * disabled), so this only drops a stamp file that a root path unit watches.
 */
final class Gateway
{
    /** Minimum seconds between restart requests. */
    public const COOLDOWN_SECONDS = 60;

    public static function requestRestart(): array
    {
        $dir = APP_ROOT . '/var/run';
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new HttpError(503, 'restart_unavailable', 'Gateway restart is not available');
        }
        $stamp = $dir . '/restart-gateway';
        $last = $dir . '/restart-gateway.last';
        if (is_file($stamp)) {
            throw new HttpError(409, 'restart_pending', 'A gateway restart is already in progress');
        }
        if (is_file($last)) {
            $wait = self::COOLDOWN_SECONDS - (time() - (int) filemtime($last));
            if ($wait > 0) {
                throw new HttpError(429, 'restart_cooldown', 'Wait before restarting the gateway again', [
                    'retry_after' => $wait,
                ]);
            }
        }
        $tmp = $stamp . '.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, (string) time()) === false) {
            throw new HttpError(503, 'restart_unavailable', 'Gateway restart is not available');
        }
        chmod($tmp, 0600);
        if (!rename($tmp, $stamp)) {
            @unlink($tmp);
            throw new HttpError(503, 'restart_unavailable', 'Gateway restart is not available');
        }
        touch($last);
        chmod($last, 0600);
        return [
            'ok' => true,
            'cooldown_seconds' => self::COOLDOWN_SECONDS,
        ];
    }

    public static function status(): array
    {
        $stamp = APP_ROOT . '/var/run/restart-gateway';
        return [
            'ok' => (new HermesClient())->healthy(),
            'restart_pending' => is_file($stamp),
        ];
    }
}
