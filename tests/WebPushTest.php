<?php
declare(strict_types=1);

use KocoUI\Push\WebPush;

return static function (): void {
    $ua = openssl_pkey_new([
        'ec' => ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC],
    ]);
    $details = openssl_pkey_get_details($ua);
    $uaPublic = "\x04"
        . str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT)
        . str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);
    $auth = random_bytes(16);
    $payload = 'hello';
    $encrypt = new ReflectionMethod(WebPush::class, 'encrypt');
    $body = $encrypt->invoke(null, $payload, $uaPublic, $auth);

    TestCase::assertSame(16 + 4 + 1 + 65 + strlen($payload) + 1 + 16, strlen($body), 'record length');
    $salt = substr($body, 0, 16);
    $rs = unpack('N', substr($body, 16, 4))[1];
    $idLen = ord($body[20]);
    TestCase::assertSame(4096, $rs, 'record size');
    TestCase::assertSame(65, $idLen, 'key id length');
    $keyId = substr($body, 21, 65);
    $rest = substr($body, 21 + 65);
    $tag = substr($rest, -16);
    $cipher = substr($rest, 0, -16);

    $plain = webpush_decrypt($ua, $uaPublic, $keyId, $auth, $salt, $cipher, $tag);
    TestCase::assertSame($payload . "\x02", $plain, 'round trip');
    TestCase::assertFalse(webpush_decrypt($ua, $uaPublic, $keyId, random_bytes(16), $salt, $cipher, $tag) === $payload . "\x02", 'wrong auth secret');
};

function webpush_decrypt($uaPrivate, string $uaPublic, string $asPublic, string $auth, string $salt, string $cipher, string $tag): string|false
{
    $prefix = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($prefix . $asPublic), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $shared = openssl_pkey_derive($pem, $uaPrivate, 32);
    if ($shared === false) {
        return false;
    }
    $expand = static fn (string $prk, string $info, int $length): string => hash_hmac('sha256', $info . "\x01", $prk, true);
    $ikm = $expand(hash_hmac('sha256', $shared, $auth, true), "WebPush: info\0" . $uaPublic . $asPublic, 32);
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    $cek = substr($expand($prk, "Content-Encoding: aes128gcm\0", 16), 0, 16);
    $nonce = substr($expand($prk, "Content-Encoding: nonce\0", 12), 0, 12);
    $plain = openssl_decrypt($cipher, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    return $plain === false ? false : $plain;
}
