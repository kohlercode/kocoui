<?php
declare(strict_types=1);

namespace KocoUI\Auth;

use KocoUI\Http\HttpError;
use PDO;

/**
 * App-level brake on password guessing, independent of nginx limit_req and
 * fail2ban. Counts failures per IP and (with double the allowance, so an
 * attacker cannot trivially lock the owner out) per username.
 */
final class LoginThrottle
{
    public function __construct(
        private readonly PDO $db,
        private readonly int $maxAttempts,
        private readonly int $window,
    ) {
    }

    public function check(string $ip, string $username): void
    {
        $since = time() - $this->window;
        $retry = max(
            $this->retryAfter('ip = ?', [$ip], $since, $this->maxAttempts),
            $this->retryAfter('username = ?', [$username], $since, $this->maxAttempts * 2),
        );
        if ($retry > 0) {
            throw new HttpError(429, 'too_many_attempts', 'Too many failed attempts', ['retry_after' => $retry]);
        }
    }

    public function record(string $ip, string $username, bool $success): void
    {
        $this->db->prepare('INSERT INTO login_attempts (ip, username, ts, success) VALUES (?, ?, ?, ?)')
            ->execute([$ip, mb_substr($username, 0, 64), time(), $success ? 1 : 0]);
        if ($success) {
            $this->db->prepare('DELETE FROM login_attempts WHERE success = 0 AND (ip = ? OR username = ?)')
                ->execute([$ip, $username]);
        }
        $this->db->prepare('DELETE FROM login_attempts WHERE ts < ?')->execute([time() - 86400]);
    }

    private function retryAfter(string $where, array $args, int $since, int $max): int
    {
        $stmt = $this->db->prepare(
            "SELECT ts FROM login_attempts WHERE success = 0 AND ts >= ? AND $where ORDER BY ts DESC LIMIT 1 OFFSET " . ($max - 1)
        );
        $stmt->execute([$since, ...$args]);
        $ts = $stmt->fetchColumn();
        return $ts === false ? 0 : max(1, (int) $ts + $this->window - time());
    }
}
