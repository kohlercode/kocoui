<?php
declare(strict_types=1);

namespace KocoUI;

use KocoUI\Auth\Totp;
use KocoUI\Auth\Users;
use KocoUI\Push\Notifier;
use KocoUI\Push\RunWatcher;
use KocoUI\Push\Vapid;
use KocoUI\Push\WatchQueue;

final class Cli
{
    private const USAGE = <<<'TXT'
    Usage: php bin/kocoui <command> [args]

      check                     Validate config, database and the connection to Hermes
      user:add <username>       Create a user (asks for a password, sets up TOTP)
      user:list                 List users
      user:password <username>  Set a new password
      user:totp <username>      Replace the TOTP secret (lost phone)
      user:delete <username>    Delete a user
      files:deleted-sessions    Print ids of recently deleted conversations (used by the file prune)
      push:vapid                Generate Web Push VAPID keys (print values for config.php)
      push:watch [--dry-run]    Send push notifications for queued runs (run by a systemd timer)

    Run as the app user, e.g.: runuser -u hermesweb -- php /home/hermesweb/app/bin/kocoui user:add alice
    TXT;

    public static function main(array $argv): int
    {
        $command = $argv[1] ?? '';
        $arg = $argv[2] ?? '';
        if ($command === '' || $command === 'help' || $command === '--help') {
            fwrite(STDOUT, self::USAGE . "\n");
            return $command === '' ? 1 : 0;
        }
        if (function_exists('posix_geteuid') && posix_geteuid() === 0) {
            fwrite(STDERR, "Refusing to run as root; files would end up owned by root. Use runuser -u <app user>.\n");
            return 1;
        }
        try {
            Config::load(APP_ROOT . '/config/config.php');
            $users = new Users(Db::pdo());
            return match ($command) {
                'check' => self::check($users),
                'user:add' => self::userAdd($users, $arg),
                'user:list' => self::userList($users),
                'user:password' => self::userPassword($users, $arg),
                'user:totp' => self::userTotp($users, $arg),
                'user:delete' => self::userDelete($users, $arg),
                'files:deleted-sessions' => self::deletedSessions(),
                'push:vapid' => self::pushVapid(),
                'push:watch' => self::pushWatch($arg === '--dry-run'),
                default => self::fail("Unknown command '$command'\n\n" . self::USAGE),
            };
        } catch (\Throwable $e) {
            return self::fail($e->getMessage());
        }
    }

    private static function check(Users $users): int
    {
        echo 'kocoui:  ' . Version::VERSION . "\n";
        $required = ['sodium', 'openssl', 'curl', 'json', 'mbstring', 'fileinfo', 'gd', 'sqlite3', 'pdo_sqlite', 'session', 'hash'];
        $missing = array_values(array_filter($required, static fn (string $e): bool => !extension_loaded($e)));
        echo 'extensions: ' . ($missing === [] ? 'ok' : 'MISSING ' . implode(', ', $missing)) . "\n";
        echo "config:   ok (" . Config::get('base_url') . ")\n";
        echo "database: ok (" . count($users->all()) . " user(s))\n";
        $pub = (string) Config::get('push.vapid_public', '');
        $priv = (string) Config::get('push.vapid_private', '');
        if ($pub === '' || $priv === '') {
            $push = 'disabled (empty push.vapid_* keys)';
        } elseif (!Vapid::configured()) {
            $push = 'INVALID vapid keys (ignored; run push:vapid)';
        } else {
            $push = 'configured';
        }
        echo "push:     $push\n";
        $base = rtrim((string) Config::get('hermes.base_url'), '/');
        [$status] = self::probe("$base/health", null);
        echo "hermes /health: HTTP $status\n";
        [$status] = self::probe("$base/v1/models", (string) Config::get('hermes.api_key'));
        echo "hermes /v1/models with key: HTTP $status" . ($status === 401 ? ' (API key rejected)' : '') . "\n";
        return ($status === 200 && $missing === []) ? 0 : 1;
    }

    private static function pushWatch(bool $dryRun = false): int
    {
        if ($dryRun) {
            foreach (WatchQueue::due(20) as $row) {
                echo $row['run_id'], "\n";
            }
            return 0;
        }
        if (!Notifier::enabled()) {
            return 0;
        }
        $dir = APP_ROOT . '/var/run';
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            return self::fail('cannot create var/run');
        }
        $fh = fopen($dir . '/push-watch.lock', 'c');
        if ($fh === false) {
            return self::fail('cannot open push-watch lock');
        }
        if (!flock($fh, LOCK_EX | LOCK_NB)) {
            fclose($fh);
            return 0;
        }
        try {
            WatchQueue::purge();
            $deadline = time() + 20;
            foreach (WatchQueue::due(20) as $row) {
                if (time() >= $deadline) {
                    break;
                }
                try {
                    $status = RunWatcher::tick((string) $row['run_id'], (int) $row['user_id'], (string) $row['session_id']);
                } catch (\Throwable $e) {
                    error_log('kocoui push watch: ' . $e->getMessage());
                    continue;
                }
                if (in_array($status, ['completed', 'failed', 'cancelled', 'interrupted', 'gone'], true)) {
                    WatchQueue::forget((string) $row['run_id']);
                }
            }
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
        return 0;
    }

    private static function pushVapid(): int
    {
        $keys = Vapid::generate();
        $subject = (string) Config::get('push.vapid_subject', '');
        if ($subject === '') {
            $subject = 'mailto:admin@example.com';
        }
        echo "Add these to config.php under 'push' (keep the private key secret):\n\n";
        echo "    'vapid_subject' => " . var_export($subject, true) . ",\n";
        echo "    'vapid_public' => " . var_export($keys['public'], true) . ",\n";
        echo "    'vapid_private' => " . var_export($keys['private'], true) . ",\n";
        echo "\nThen reload PHP-FPM. Existing browser subscriptions stay valid only with the same public key.\n";
        return 0;
    }

    private static function userAdd(Users $users, string $username): int
    {
        if (!preg_match('/^[A-Za-z0-9._-]{3,32}$/', $username)) {
            return self::fail('Username must be 3-32 characters: letters, digits, . _ -');
        }
        if ($users->findByUsername($username)) {
            return self::fail("User '$username' already exists");
        }
        $password = self::askNewPassword();
        $secret = self::enrollTotp($username);
        if ($secret === null) {
            return self::fail('TOTP not confirmed; user not created');
        }
        $users->create($username, $password, $secret);
        echo "User '$username' created.\n";
        return 0;
    }

    private static function userList(Users $users): int
    {
        foreach ($users->all() as $u) {
            printf("%-24s created %s  last login %s\n", $u['username'], date('Y-m-d', (int) $u['created_at']),
                $u['last_login_at'] ? date('Y-m-d H:i', (int) $u['last_login_at']) : 'never');
        }
        return 0;
    }

    private static function userPassword(Users $users, string $username): int
    {
        $user = $users->findByUsername($username) ?? throw new \RuntimeException("No user '$username'");
        $users->setPassword((int) $user['id'], self::askNewPassword());
        echo "Password updated. Existing sessions stay valid until they expire.\n";
        return 0;
    }

    private static function userTotp(Users $users, string $username): int
    {
        $user = $users->findByUsername($username) ?? throw new \RuntimeException("No user '$username'");
        $secret = self::enrollTotp($user['username']);
        if ($secret === null) {
            return self::fail('TOTP not confirmed; nothing changed');
        }
        $users->setTotp((int) $user['id'], $secret);
        echo "TOTP secret replaced.\n";
        return 0;
    }

    private static function userDelete(Users $users, string $username): int
    {
        $user = $users->findByUsername($username) ?? throw new \RuntimeException("No user '$username'");
        if (strtolower(self::ask("Type the username to confirm deletion: ")) !== strtolower($user['username'])) {
            return self::fail('Not confirmed');
        }
        $users->delete((int) $user['id']);
        echo "Deleted.\n";
        return 0;
    }

    private static function deletedSessions(): int
    {
        foreach (array_keys(DeletedSessions::recent()) as $id) {
            echo $id, "\n";
        }
        return 0;
    }

    private static function askNewPassword(): string
    {
        for ($try = 0; $try < 3; $try++) {
            $a = self::ask('New password (min. 14 characters): ', true);
            if (mb_strlen($a) < 14) {
                echo "Too short.\n";
                continue;
            }
            if (self::ask('Repeat password: ', true) !== $a) {
                echo "Passwords do not match.\n";
                continue;
            }
            return $a;
        }
        throw new \RuntimeException('No valid password entered');
    }

    private static function enrollTotp(string $username): ?string
    {
        $secret = Totp::generateSecret();
        $issuer = (string) Config::get('app_name', 'Hermes');
        echo "\nAdd this account to your authenticator app (manual entry, time-based, 6 digits, 30 s):\n\n";
        echo '  Account: ' . $username . '@' . parse_url((string) Config::get('base_url'), PHP_URL_HOST) . "\n";
        echo '  Key:     ' . implode(' ', str_split($secret, 4)) . "\n\n";
        echo "  or as URI: " . Totp::uri($issuer, $username, $secret) . "\n\n";
        for ($try = 0; $try < 3; $try++) {
            $code = preg_replace('/\s+/', '', self::ask('Enter the current 6-digit code to confirm: '));
            if (Totp::verify($secret, $code) !== false) {
                return $secret;
            }
            echo "Code does not match (check the phone's clock).\n";
        }
        return null;
    }

    private static function ask(string $prompt, bool $hidden = false): string
    {
        echo $prompt;
        $tty = $hidden && stream_isatty(STDIN);
        if ($tty) {
            shell_exec('stty -echo');
        }
        $line = fgets(STDIN);
        if ($tty) {
            shell_exec('stty echo');
            echo "\n";
        }
        return rtrim((string) $line, "\r\n");
    }

    /** @return array{0:int} */
    private static function probe(string $url, ?string $key): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => $key ? ["Authorization: Bearer $key"] : [],
        ]);
        curl_exec($ch);
        return [(int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE)];
    }

    private static function fail(string $message): int
    {
        fwrite(STDERR, $message . "\n");
        return 1;
    }
}
