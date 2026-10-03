<?php
declare(strict_types=1);

namespace KocoUI\Push;

use KocoUI\Config;

/** VAPID (RFC 8292) key helpers and JWT for Web Push Authorization. */
final class Vapid
{
    public static function configured(): bool
    {
        $pub = (string) Config::get('push.vapid_public', '');
        $priv = (string) Config::get('push.vapid_private', '');
        if ($pub === '' || $priv === '') {
            return false;
        }
        try {
            return strlen(Base64Url::decode($pub)) === 65 && strlen(Base64Url::decode($priv)) === 32;
        } catch (\InvalidArgumentException) {
            return false;
        }
    }

    public static function publicKey(): string
    {
        return (string) Config::get('push.vapid_public', '');
    }

    /** @return array{public:string,private:string} base64url keys */
    public static function generate(): array
    {
        $key = openssl_pkey_new([
            'ec' => [
                'curve_name' => 'prime256v1',
                'private_key_type' => OPENSSL_KEYTYPE_EC,
            ],
        ]);
        if ($key === false) {
            throw new \RuntimeException('openssl_pkey_new failed');
        }
        $details = openssl_pkey_get_details($key);
        if ($details === false || !isset($details['ec']['x'], $details['ec']['y'], $details['ec']['d'])) {
            throw new \RuntimeException('openssl_pkey_get_details failed');
        }
        $x = str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT);
        $y = str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);
        $d = str_pad($details['ec']['d'], 32, "\0", STR_PAD_LEFT);
        return [
            'public' => Base64Url::encode("\x04" . $x . $y),
            'private' => Base64Url::encode($d),
        ];
    }

    /** Authorization header value: vapid t=JWT, k=publicKey */
    public static function authorizationHeader(string $endpoint): string
    {
        $public = Base64Url::decode((string) Config::get('push.vapid_public'));
        $private = Base64Url::decode((string) Config::get('push.vapid_private'));
        if (strlen($public) !== 65 || strlen($private) !== 32) {
            throw new \RuntimeException('Invalid VAPID key material');
        }

        $parts = parse_url($endpoint);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            throw new \InvalidArgumentException('Invalid push endpoint');
        }
        $aud = $parts['scheme'] . '://' . $parts['host'];
        $sub = (string) Config::get('push.vapid_subject', '');
        if ($sub === '') {
            $sub = (string) Config::get('base_url');
        }

        $header = Base64Url::encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256'], JSON_THROW_ON_ERROR));
        $claims = Base64Url::encode(json_encode([
            'aud' => $aud,
            'exp' => time() + 12 * 3600,
            'sub' => $sub,
        ], JSON_THROW_ON_ERROR));
        $unsigned = $header . '.' . $claims;

        $pem = self::privateKeyPem($private, $public);
        $der = '';
        if (!openssl_sign($unsigned, $der, $pem, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('VAPID openssl_sign failed');
        }
        $jwt = $unsigned . '.' . Base64Url::encode(self::derToJose($der));
        return 'vapid t=' . $jwt . ', k=' . Base64Url::encode($public);
    }

    private static function privateKeyPem(string $d, string $public): string
    {
        // SEC1 ECPrivateKey DER with public key bit string appended (see web-push libs).
        $der = hex2bin(
            '3077'
            . '020101'
            . '0420' . bin2hex($d)
            . 'a00a06082a8648ce3d030107'
            . 'a144034200'
        );
        $der .= $public;
        return "-----BEGIN EC PRIVATE KEY-----\n"
            . chunk_split(base64_encode($der), 64, "\n")
            . "-----END EC PRIVATE KEY-----\n";
    }

    /** Convert ASN.1 DER ECDSA signature to raw R||S (each 32 bytes). */
    private static function derToJose(string $der): string
    {
        $pos = 0;
        if (($der[$pos++] ?? '') !== "\x30") {
            throw new \RuntimeException('Bad DER signature');
        }
        $len = ord($der[$pos++]);
        if ($len & 0x80) {
            $pos += $len & 0x7f;
        }
        if (($der[$pos++] ?? '') !== "\x02") {
            throw new \RuntimeException('Bad DER signature');
        }
        $rLen = ord($der[$pos++]);
        $r = substr($der, $pos, $rLen);
        $pos += $rLen;
        if (($der[$pos++] ?? '') !== "\x02") {
            throw new \RuntimeException('Bad DER signature');
        }
        $sLen = ord($der[$pos++]);
        $s = substr($der, $pos, $sLen);
        $r = str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT);
        $s = str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);
        return $r . $s;
    }
}
