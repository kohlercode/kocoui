<?php
declare(strict_types=1);

use KocoUI\Fonts;

return static function (): void {
    $repoFonts = dirname(__DIR__) . '/app/public/fonts';
    foreach (Fonts::BUILTIN as $id => $spec) {
        $files = Fonts::declaredFiles($spec);
        TestCase::assertTrue($files !== [], $id . ' declares files');
        foreach ($files as $rel) {
            TestCase::assertTrue(is_file($repoFonts . '/' . $rel), $rel);
        }
        TestCase::assertTrue(is_file($repoFonts . '/' . $id . '/LICENSE'), $id . ' license');
    }

    $empty = Fonts::catalog();
    TestCase::assertSame('system', $empty['default'], 'missing files fall back to system default');
    TestCase::assertSame([['id' => 'system', 'family' => 'system', 'files' => []]], $empty['families'], 'no webfonts without files on disk');

    $fontsDir = APP_ROOT . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'fonts';
    $okDir = $fontsDir . DIRECTORY_SEPARATOR . 'ok';
    if (!is_dir($okDir) && !mkdir($okDir, 0700, true) && !is_dir($okDir)) {
        throw new RuntimeException('cannot create test fonts dir');
    }
    $okFile = $okDir . DIRECTORY_SEPARATOR . 'ok-latin-wght-normal.woff2';
    file_put_contents($okFile, str_repeat('W', 64));
    file_put_contents(APP_ROOT . DIRECTORY_SEPARATOR . 'secret.woff2', str_repeat('X', 64));

    kocoui_write_config([
        'fonts' => [
            'default' => 'ok',
            'families' => [
                'ok' => [
                    'family' => 'Ok Sans',
                    'weight' => '100 900',
                    'file' => 'ok/ok-latin-wght-normal.woff2',
                ],
                'missing' => [
                    'family' => 'Ghost',
                    'file' => 'ghost/ghost.woff2',
                ],
                'escape' => [
                    'family' => 'Escape',
                    'file' => '../secret.woff2',
                ],
                'Bad Id' => [
                    'family' => 'Nope',
                    'file' => 'ok/ok-latin-wght-normal.woff2',
                ],
                'system' => [
                    'family' => 'Hijack',
                    'file' => 'ok/ok-latin-wght-normal.woff2',
                ],
            ],
        ],
    ]);

    $cat = Fonts::catalog();
    TestCase::assertSame('ok', $cat['default'], 'configured default');
    TestCase::assertSame('system', $cat['families'][0]['id'], 'system first');
    TestCase::assertSame(2, count($cat['families']), 'only valid existing family plus system');
    TestCase::assertSame('ok', $cat['families'][1]['id'], 'ok family id');
    TestCase::assertSame('Ok Sans', $cat['families'][1]['family'], 'ok family name');
    TestCase::assertSame('/fonts/ok/ok-latin-wght-normal.woff2', $cat['families'][1]['files'][0]['url'], 'url');
    TestCase::assertSame('100 900', $cat['families'][1]['files'][0]['weight'], 'weight');
    TestCase::assertTrue(isset($cat['families'][1]['files'][0]['unicodeRange']), 'latin unicode-range');

    kocoui_write_config([
        'fonts' => [
            'default' => 'ghost',
            'families' => [
                'ok' => [
                    'family' => 'Ok Sans',
                    'file' => [
                        '400' => 'ok/ok-latin-wght-normal.woff2',
                        '700' => 'ok/ok-latin-wght-normal.woff2',
                    ],
                ],
            ],
        ],
    ]);
    $weights = Fonts::catalog();
    TestCase::assertSame('system', $weights['default'], 'unknown default becomes system');
    TestCase::assertSame(2, count($weights['families'][1]['files']), 'weight map expands');

    kocoui_write_config();
};
