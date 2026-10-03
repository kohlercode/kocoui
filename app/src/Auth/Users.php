<?php
declare(strict_types=1);

namespace KocoUI\Auth;

use PDO;

final class Users
{
    private const HASH_OPTIONS = ['memory_cost' => 65536, 'time_cost' => 4, 'threads' => 1];

    public function __construct(private readonly PDO $db)
    {
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_ARGON2ID, self::HASH_OPTIONS);
    }

    public static function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_ARGON2ID, self::HASH_OPTIONS);
    }

    /** Verifies against a throwaway hash when the user is unknown, so timing does not reveal usernames. */
    public static function verifyPassword(string $password, ?string $hash): bool
    {
        static $dummy = null;
        if ($hash === null) {
            $dummy ??= self::hashPassword(bin2hex(random_bytes(16)));
            password_verify($password, $dummy);
            return false;
        }
        return password_verify($password, $hash);
    }

    public function findByUsername(string $username): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE username = ?');
        $stmt->execute([$username]);
        return $stmt->fetch() ?: null;
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch() ?: null;
    }

    public function all(): array
    {
        return $this->db->query('SELECT id, username, created_at, last_login_at FROM users ORDER BY id')->fetchAll();
    }

    public function create(string $username, string $password, string $totpSecret): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO users (username, password_hash, totp_secret_enc, created_at) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$username, self::hashPassword($password), Crypto::encrypt($totpSecret), time()]);
        return (int) $this->db->lastInsertId();
    }

    public function setPassword(int $id, string $password): void
    {
        $this->db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([self::hashPassword($password), $id]);
    }

    public function setTotp(int $id, string $totpSecret): void
    {
        $this->db->prepare('UPDATE users SET totp_secret_enc = ?, totp_last_step = 0 WHERE id = ?')
            ->execute([Crypto::encrypt($totpSecret), $id]);
    }

    public function totpSecret(array $user): string
    {
        return Crypto::decrypt($user['totp_secret_enc']);
    }

    public function recordLogin(int $id, int $totpStep, ?string $rehashPassword = null): void
    {
        $this->db->prepare('UPDATE users SET totp_last_step = ?, last_login_at = ? WHERE id = ?')
            ->execute([$totpStep, time(), $id]);
        if ($rehashPassword !== null) {
            $this->setPassword($id, $rehashPassword);
        }
    }

    public function delete(int $id): void
    {
        $this->db->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    }
}
