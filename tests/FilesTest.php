<?php
declare(strict_types=1);

use KocoUI\Files;

return static function (): void {
    TestCase::assertNull(Files::resolve(''), 'empty path');
    TestCase::assertNull(Files::resolve("/etc/passwd\0"), 'nul');
    TestCase::assertNull(Files::resolve(str_repeat('/a', 1100)), 'too long');
    TestCase::assertNull(Files::resolve('relative.txt'), 'not absolute');

    $root = Files::root();
    if (!str_starts_with($root, '/')) {
        echo "skip  Files resolve escapes (non-posix root)\n";
    } else {
        $inside = $root . '/inbox/note.txt';
        file_put_contents($inside, 'hello');
        TestCase::assertSame($inside, Files::resolve($inside), 'file inside root');
        TestCase::assertNull(Files::resolve('/etc/passwd'), '/etc/passwd');
        TestCase::assertNull(Files::resolve($root . '/inbox/../../etc/passwd'), 'traversal');
        $outside = sys_get_temp_dir() . '/kocoui-outside-' . getmypid() . '.txt';
        file_put_contents($outside, 'nope');
        $link = $root . '/inbox/out';
        if (@symlink($outside, $link)) {
            TestCase::assertNull(Files::resolve($link), 'symlink escape');
            unlink($link);
        } else {
            echo "skip  symlink escape\n";
        }
        unlink($outside);
        TestCase::assertNull(Files::resolve($root . '/inbox'), 'directory is not a file');
    }

    TestCase::assertSame('passwd', Files::sanitizeName('../../etc/passwd'), 'basename');
    TestCase::assertSame('y.txt', Files::sanitizeName('C:\\x\\y.txt'), 'windows path');
    TestCase::assertSame('a_b.txt', Files::sanitizeName("a\nb.txt"), 'newline');
    TestCase::assertSame('file', Files::sanitizeName('.'), 'dot');
    TestCase::assertSame('file', Files::sanitizeName('..'), 'dotdot');
    $long = str_repeat('a', 200) . '.txt';
    $clean = Files::sanitizeName($long);
    TestCase::assertTrue(mb_strlen($clean) <= 120, 'truncated');
    TestCase::assertTrue(str_ends_with($clean, '.txt'), 'extension kept');
    TestCase::assertSame('bericht-ü.txt', Files::sanitizeName('bericht-ü.txt'), 'utf-8');

    TestCase::assertSame('file', Files::kind('image/svg+xml'), 'svg is not an image');
    TestCase::assertSame('image', Files::kind('image/png'), 'png');
    TestCase::assertFalse(Files::inlineSafe('text/html'), 'html not inline');
    TestCase::assertTrue(Files::inlineSafe('application/pdf'), 'pdf inline');
};
