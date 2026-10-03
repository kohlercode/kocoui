<?php
declare(strict_types=1);

namespace KocoUI\Auth;

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — the variant every authenticator app supports. */
final class Totp
{
    private const PERIOD = 30;
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    /**
     * @param int|null $now Unix time to use instead of time() (tests only).
     * @return int|false the matched time step, or false. Steps at or below $lastStep
     *                   are refused so an observed code cannot be replayed, and a
     *                   match can never advance past the current step: an
     *                   authenticator running ahead must not burn the window that
     *                   the correct code will need.
     */
    public static function verify(string $secret, string $code, int $lastStep = 0, int $window = 1, ?int $now = null): int|false
    {
        if (!preg_match('/^\d{6}$/', $code)) {
            return false;
        }
        $current = intdiv($now ?? time(), self::PERIOD);
        $matched = false;
        for ($i = -$window; $i <= $window; $i++) {
            $step = $current + $i;
            if ($step > $current || $step <= $lastStep) {
                continue;
            }
            if (hash_equals(self::code($secret, $step), $code)) {
                $matched = $step;
            }
        }
        return $matched;
    }

    public static function code(string $secret, int $step): string
    {
        $hash = hash_hmac('sha1', pack('J', $step), self::base32Decode($secret), true);
        $offset = ord($hash[19]) & 0x0f;
        $value = ((ord($hash[$offset]) & 0x7f) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);
        return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
    }

    public static function uri(string $issuer, string $account, string $secret): string
    {
        $label = rawurlencode($issuer) . ':' . rawurlencode($account);
        $query = http_build_query(
            ['secret' => $secret, 'issuer' => $issuer, 'algorithm' => 'SHA1', 'digits' => 6, 'period' => self::PERIOD],
            '',
            '&',
            PHP_QUERY_RFC3986,
        );
        return "otpauth://totp/$label?$query";
    }

    private static function base32Encode(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $char) {
            $bits .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::ALPHABET[bindec(str_pad($chunk, 5, '0'))];
        }
        return $out;
    }

    private static function base32Decode(string $text): string
    {
        $text = strtoupper(preg_replace('/[\s=]/', '', $text));
        $bits = '';
        foreach (str_split($text) as $char) {
            $pos = strpos(self::ALPHABET, $char);
            if ($pos === false) {
                throw new \InvalidArgumentException('Invalid base32');
            }
            $bits .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }
        return $out;
    }
}
