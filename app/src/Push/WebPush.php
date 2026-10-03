<?php
declare(strict_types=1);

namespace KocoUI\Push;

/**
 * Send one Web Push message (RFC 8291 aes128gcm + RFC 8292 VAPID).
 * No Composer deps: openssl ECDH + AES-128-GCM + curl.
 */
final class WebPush
{
    /**
     * @return int HTTP status from the push service (201/200 = ok; 404/410 = gone)
     */
    public static function send(string $endpoint, string $p256dh, string $auth, string $payload, int $ttl = 86400, string $urgency = 'normal'): int
    {
        $body = self::encrypt($payload, Base64Url::decode($p256dh), Base64Url::decode($auth));
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'TTL: ' . $ttl,
                'Urgency: ' . $urgency,
                'Content-Type: application/octet-stream',
                'Content-Encoding: aes128gcm',
                'Content-Length: ' . strlen($body),
                'Authorization: ' . Vapid::authorizationHeader($endpoint),
            ],
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($status === 0) {
            throw new \RuntimeException('Push endpoint unreachable');
        }
        return $status;
    }

    private static function encrypt(string $payload, string $userPublic, string $userAuth): string
    {
        if (strlen($userPublic) !== 65 || ($userPublic[0] ?? '') !== "\x04") {
            throw new \InvalidArgumentException('Invalid p256dh');
        }
        if (strlen($userAuth) !== 16) {
            throw new \InvalidArgumentException('Invalid auth secret');
        }

        $local = openssl_pkey_new([
            'ec' => [
                'curve_name' => 'prime256v1',
                'private_key_type' => OPENSSL_KEYTYPE_EC,
            ],
        ]);
        if ($local === false) {
            throw new \RuntimeException('Local ECDH key failed');
        }
        $localDetails = openssl_pkey_get_details($local);
        if ($localDetails === false) {
            throw new \RuntimeException('Local ECDH details failed');
        }
        $asPublic = "\x04"
            . str_pad($localDetails['ec']['x'], 32, "\0", STR_PAD_LEFT)
            . str_pad($localDetails['ec']['y'], 32, "\0", STR_PAD_LEFT);

        $userPem = self::publicKeyPem($userPublic);
        $shared = openssl_pkey_derive($userPem, $local, 32);
        if ($shared === false || strlen($shared) === 0) {
            throw new \RuntimeException('ECDH derive failed');
        }

        // RFC 8291 §3.4
        $keyInfo = "WebPush: info\0" . $userPublic . $asPublic;
        $ikm = self::hkdfExpand(hash_hmac('sha256', $shared, $userAuth, true), $keyInfo, 32);

        $salt = random_bytes(16);
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        $cek = substr(self::hkdfExpand($prk, "Content-Encoding: aes128gcm\0", 16), 0, 16);
        $nonce = substr(self::hkdfExpand($prk, "Content-Encoding: nonce\0", 12), 0, 12);

        // One record: plaintext || 0x02 delimiter (no extra padding).
        $plaintext = $payload . "\x02";
        $tag = '';
        $cipher = openssl_encrypt($plaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
        if ($cipher === false) {
            throw new \RuntimeException('AES-GCM encrypt failed');
        }

        // RFC 8188 header: salt || record_size || id_len || key_id
        return $salt . pack('N', 4096) . chr(strlen($asPublic)) . $asPublic . $cipher . $tag;
    }

    private static function hkdfExpand(string $prk, string $info, int $length): string
    {
        return hash_hmac('sha256', $info . "\x01", $prk, true);
    }

    private static function publicKeyPem(string $uncompressed): string
    {
        // SubjectPublicKeyInfo for P-256 uncompressed point.
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $uncompressed;
        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($der), 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }
}
