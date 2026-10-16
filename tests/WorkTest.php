<?php
declare(strict_types=1);

use KocoUI\Work;

return static function (): void {
    TestCase::assertNull(Work::relative("a\0b"), 'nul');
    TestCase::assertNull(Work::relative('/etc/passwd'), 'absolute');
    TestCase::assertNull(Work::relative('..'), 'dotdot');
    TestCase::assertNull(Work::relative('notes/../../etc/passwd'), 'traversal');
    TestCase::assertNull(Work::relative('a//b'), 'empty segment');
    TestCase::assertNull(Work::relative('a/./b'), 'dot segment');
    TestCase::assertSame('', Work::relative(''), 'root relative');
    TestCase::assertSame('notes/today.md', Work::relative('notes/today.md'), 'nested relative');

    $root = Work::root();
    TestCase::assertTrue(is_string($root) && $root !== '', 'work root configured');
    if (!is_string($root)) {
        return;
    }

    mkdir($root . '/notes');
    file_put_contents($root . '/notes/today.md', 'hello');
    file_put_contents($root . '/page.html', '<p>x</p>');
    file_put_contents($root . '/b.txt', 'bee');

    TestCase::assertNull(Work::file('notes'), 'directory is not a file');
    TestCase::assertNull(Work::file('notes/../../etc/passwd'), 'file traversal');
    $md = Work::file('notes/today.md');
    TestCase::assertTrue(is_string($md) && str_ends_with($md, 'notes/today.md'), 'file inside root');
    $text = is_string($md) ? Work::readText($md) : null;
    TestCase::assertSame('hello', $text['text'] ?? null, 'text preview');
    TestCase::assertFalse($text['truncated'] ?? true, 'short text is complete');
    $html = Work::file('page.html');
    TestCase::assertTrue(is_string($html), 'html file resolves');
    TestCase::assertNull(is_string($html) ? Work::readText($html) : 'skip', 'html is not previewed as text');

    $list = Work::listing('');
    TestCase::assertSame('', $list['path'] ?? 'missing', 'listing root path');
    $names = array_map(static fn (array $row): string => $row['type'] . ':' . $row['name'], $list['entries'] ?? []);
    TestCase::assertSame(['dir:notes', 'file:b.txt', 'file:page.html'], $names, 'dirs first, then names');
    $htmlRow = null;
    foreach ($list['entries'] ?? [] as $row) {
        if ($row['name'] === 'page.html') {
            $htmlRow = $row;
        }
    }
    TestCase::assertFalse($htmlRow['text'] ?? true, 'html row is not text');
    TestCase::assertTrue(($list['entries'][1]['text'] ?? false) === true, 'txt row is text');
    TestCase::assertFalse($list['truncated'] ?? true, 'listing not truncated');
    TestCase::assertNull(Work::listing('missing'), 'missing folder');

    $outside = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'kocoui-work-out-' . getmypid() . '.txt';
    file_put_contents($outside, 'nope');
    $link = $root . '/escape.txt';
    if (@symlink($outside, $link)) {
        TestCase::assertNull(Work::file('escape.txt'), 'symlink escape');
        $linked = Work::listing('');
        $escape = null;
        foreach ($linked['entries'] ?? [] as $row) {
            if ($row['name'] === 'escape.txt') {
                $escape = $row;
            }
        }
        TestCase::assertSame('link', $escape['type'] ?? '', 'symlink is not opened');
        unlink($link);
    } else {
        echo "skip  work symlink escape\n";
    }
    unlink($outside);

    kocoui_write_config(['files' => ['work_root' => '']]);
    TestCase::assertNull(Work::root(), 'empty config');
    TestCase::assertFalse(Work::enabled(), 'disabled when unset');
    kocoui_write_config();
};
