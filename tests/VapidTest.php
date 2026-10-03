<?php
declare(strict_types=1);

use KocoUI\Push\Base64Url;
use KocoUI\Push\Vapid;

return static function (): void {
    $keys = Vapid::generate();
    $pub = Base64Url::decode($keys['public']);
    $priv = Base64Url::decode($keys['private']);
    TestCase::assertSame(65, strlen($pub), 'public length');
    TestCase::assertSame("\x04", $pub[0], 'uncompressed point');
    TestCase::assertSame(32, strlen($priv), 'private length');

    kocoui_write_config(['push' => [
        'vapid_subject' => 'mailto:admin@test.local',
        'vapid_public' => $keys['public'],
        'vapid_private' => $keys['private'],
    ]]);
    $header = Vapid::authorizationHeader('https://push.example.com/x');
    TestCase::assertTrue(str_starts_with($header, 'vapid t='), 'vapid prefix');
    $jwt = substr($header, strlen('vapid t='));
    $jwt = explode(',', $jwt, 2)[0];
    $parts = explode('.', $jwt);
    TestCase::assertSame(3, count($parts), 'jwt parts');
    $jwtHeader = json_decode(Base64Url::decode($parts[0]), true);
    $claims = json_decode(Base64Url::decode($parts[1]), true);
    TestCase::assertSame('ES256', $jwtHeader['alg'] ?? null, 'alg');
    TestCase::assertSame('JWT', $jwtHeader['typ'] ?? null, 'typ');
    TestCase::assertSame('https://push.example.com', $claims['aud'] ?? null, 'aud');
    TestCase::assertSame('mailto:admin@test.local', $claims['sub'] ?? null, 'sub');
    $exp = (int) ($claims['exp'] ?? 0);
    TestCase::assertTrue($exp >= time() + 11 * 3600 && $exp <= time() + 13 * 3600, 'exp window');

    $sig = Base64Url::decode($parts[2]);
    $prefix = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($prefix . $pub), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $verified = openssl_verify($parts[0] . '.' . $parts[1], jose_to_der($sig), $pem, OPENSSL_ALGO_SHA256);
    TestCase::assertSame(1, $verified, 'ES256 signature');

    kocoui_write_config();
    TestCase::assertFalse(Vapid::configured(), 'empty keys');
    kocoui_write_config(['push' => [
        'vapid_subject' => 'mailto:admin@test.local',
        'vapid_public' => '!!!',
        'vapid_private' => $keys['private'],
    ]]);
    TestCase::assertFalse(Vapid::configured(), 'malformed public key');
    kocoui_write_config();
};

function jose_to_der(string $jose): string
{
    $r = substr($jose, 0, 32);
    $s = substr($jose, 32, 32);
    $trim = static function (string $part): string {
        $part = ltrim($part, "\0");
        if ($part === '' || (ord($part[0]) & 0x80) !== 0) {
            $part = "\0" . $part;
        }
        return $part;
    };
    $r = $trim($r);
    $s = $trim($s);
    $body = "\x02" . chr(strlen($r)) . $r . "\x02" . chr(strlen($s)) . $s;
    return "\x30" . chr(strlen($body)) . $body;
}
