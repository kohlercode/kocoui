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
    file_put_contents($root . '/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

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
    $svg = Work::file('icon.svg');
    TestCase::assertTrue(is_string($svg), 'svg file resolves');
    TestCase::assertNull(is_string($svg) ? Work::readText($svg) : 'skip', 'svg is not previewed as text');
    TestCase::assertFalse(Work::isText('icon.svg'), 'svg extension is not text');

    $list = Work::listing('');
    TestCase::assertSame('', $list['path'] ?? 'missing', 'listing root path');
    TestCase::assertSame($root, $list['absolute'] ?? '', 'listing absolute root');
    $names = array_map(static fn (array $row): string => $row['type'] . ':' . $row['name'], $list['entries'] ?? []);
    TestCase::assertSame(['dir:notes', 'file:b.txt', 'file:icon.svg', 'file:page.html'], $names, 'dirs first, then names');
    $htmlRow = null;
    $txtRow = null;
    $svgRow = null;
    $notesRow = null;
    foreach ($list['entries'] ?? [] as $row) {
        if ($row['name'] === 'page.html') {
            $htmlRow = $row;
        }
        if ($row['name'] === 'b.txt') {
            $txtRow = $row;
        }
        if ($row['name'] === 'icon.svg') {
            $svgRow = $row;
        }
        if ($row['name'] === 'notes') {
            $notesRow = $row;
        }
    }
    TestCase::assertFalse($htmlRow['text'] ?? true, 'html row is not text');
    TestCase::assertSame('html', $htmlRow['kind'] ?? '', 'html kind');
    TestCase::assertTrue(($htmlRow['previewable'] ?? false) === true, 'html is previewable');
    TestCase::assertFalse($htmlRow['oversized'] ?? true, 'small html is not oversized');
    TestCase::assertTrue(($txtRow['text'] ?? false) === true, 'txt row is text');
    TestCase::assertTrue(($txtRow['previewable'] ?? false) === true, 'txt is previewable');
    TestCase::assertTrue(str_ends_with((string) ($txtRow['absolute'] ?? ''), 'b.txt'), 'file absolute path');
    TestCase::assertSame('image', $svgRow['kind'] ?? '', 'svg kind is image');
    TestCase::assertTrue(($svgRow['previewable'] ?? false) === true, 'svg is previewable as image');
    TestCase::assertTrue(str_ends_with((string) ($notesRow['absolute'] ?? ''), 'notes'), 'dir absolute path');
    TestCase::assertFalse($list['truncated'] ?? true, 'listing not truncated');
    TestCase::assertNull(Work::listing('missing'), 'missing folder');

    kocoui_write_config(['files' => ['work_preview_max_mb' => 0]]);
    TestCase::assertFalse(Work::withinPreviewLimit(1), 'zero max blocks preview');
    TestCase::assertNull(Work::readText($md), 'oversize text not previewed');
    $blocked = Work::listing('');
    $blockedTxt = null;
    foreach ($blocked['entries'] ?? [] as $row) {
        if ($row['name'] === 'b.txt') {
            $blockedTxt = $row;
        }
    }
    TestCase::assertFalse($blockedTxt['previewable'] ?? true, 'listing marks oversize not previewable');
    kocoui_write_config();

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
