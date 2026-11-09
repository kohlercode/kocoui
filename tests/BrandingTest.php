<?php
declare(strict_types=1);

use KocoUI\Branding;
use KocoUI\Http\HttpError;

return static function (): void {
    $state = Branding::publicState();
    TestCase::assertSame('Test', $state['app_name'], 'seeds from config app_name');
    TestCase::assertSame(Branding::BUILTIN_COLORS['light']['primary'], $state['colors']['light']['primary'], 'builtin light');
    TestCase::assertSame('', $state['urls']['logo'], 'no custom logo');
    TestCase::assertTrue(str_contains($state['urls']['icon192'], '/icons/icon-192.png'), 'stock pwa icon');

    $saved = Branding::saveSettings([
        'app_name' => '  Onkel Bob  ',
        'colors' => [
            'light' => ['primary' => '#112233', 'bogus' => '#000000'],
            'dark' => ['bg' => 'not-a-color', 'text' => '#abcdef'],
        ],
    ]);
    TestCase::assertSame('Onkel Bob', $saved['app_name'], 'trims name');
    TestCase::assertSame('#112233', $saved['colors']['light']['primary'], 'accepts hex');
    TestCase::assertSame(Branding::BUILTIN_COLORS['light']['bg'], $saved['colors']['light']['bg'], 'keeps other light keys');
    TestCase::assertSame(Branding::BUILTIN_COLORS['dark']['bg'], $saved['colors']['dark']['bg'], 'rejects bad hex');
    TestCase::assertSame('#abcdef', $saved['colors']['dark']['text'], 'accepts dark hex');

    TestCase::assertThrows(HttpError::class, static fn () => Branding::sanitizeName(str_repeat('x', Branding::MAX_NAME + 1)), 'name too long');
    TestCase::assertThrows(HttpError::class, static fn () => Branding::assertSafeSvg('<svg><script>alert(1)</script></svg>'), 'unsafe svg');
    Branding::assertSafeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7"/></svg>');
    TestCase::assertTrue(true, 'safe svg accepted');

    $png1 = solidPng(1, 1);
    TestCase::assertThrows(HttpError::class, static fn () => Branding::assertSquarePng($png1, 192), 'size mismatch');

    $png192 = solidPng(192, 192);
    Branding::assertSquarePng($png192, 192);
    $after = Branding::saveIcon('icon192', $png192, 'icon.png');
    TestCase::assertTrue($after['icons']['icon192'], 'icon192 custom');
    TestCase::assertTrue(str_contains($after['urls']['icon192'], '/branding/icon-192.png'), 'custom url');

    $cleared = Branding::deleteIcon('icon192');
    TestCase::assertFalse($cleared['icons']['icon192'], 'icon192 cleared');

    $rect = solidPng(32, 16);
    TestCase::assertThrows(HttpError::class, static fn () => Branding::assertSquarePng($rect, null), 'not square');
    TestCase::assertThrows(HttpError::class, static fn () => Branding::saveIcon('favicon', 'not-an-ico', 'favicon.ico'), 'bad ico');
};

/** Minimal valid RGB PNG of WxH via GD. */
function solidPng(int $w, int $h): string
{
    $im = imagecreatetruecolor($w, $h);
    $color = imagecolorallocate($im, 20, 40, 60);
    imagefill($im, 0, 0, $color);
    ob_start();
    imagepng($im);
    imagedestroy($im);
    return (string) ob_get_clean();
}
