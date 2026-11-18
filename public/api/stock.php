<?php
// EditSupreme stock-photo helper (runs on the web host, e.g. GoDaddy cPanel with PHP 7.4+).
// It keeps the site's free Pexels / Pixabay / Unsplash API keys on the server, so visitors can search
// those sites without keys of their own. It only talks to those three services: it is not an open proxy.
//
// Keys: copy stock-keys.example.php to ONE of these places and fill in your keys:
//   1. the folder ABOVE public_html, named editsupreme-stock-keys.php (best: not reachable from the web)
//   2. this folder (public_html/api/stock-keys.php)
//
// Calls (GET):
//   ?action=status                                  -> {"sources":["pexels",...]}
//   ?action=search&source=pexels&q=coffee&page=1    -> {"photos":[...]}
//   ?action=img&url=<pixabay image url>             -> the picture (Pixabay doesn't allow direct downloads)
//   ?action=ping&url=<unsplash download_location>   -> tells Unsplash a photo was used (their API rule)

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function out($code, $data) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

// ---------- keys ----------
$keys = [];
foreach ([dirname(__DIR__, 2) . '/editsupreme-stock-keys.php', __DIR__ . '/stock-keys.php'] as $f) {
  if (is_readable($f)) { $k = include $f; if (is_array($k)) { $keys = $k; break; } }
}
$keys = array_filter(array_map(function ($v) { return trim((string)$v); }, array_intersect_key($keys, array_flip(['pexels', 'pixabay', 'unsplash']))));

// ---------- only this website may use it ----------
$host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
$from = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
if ($from !== '') {
  $fh = strtolower((string)parse_url($from, PHP_URL_HOST));
  if ($fh !== $host && $fh !== 'www.' . $host && 'www.' . $fh !== $host) out(403, ['error' => 'Not allowed.']);
}

// ---------- rate limit: 240 calls per visitor per 10 minutes ----------
$tmp = rtrim(sys_get_temp_dir(), '/\\') . '/editsupreme-stock';
if (!is_dir($tmp)) @mkdir($tmp, 0700, true);
$ipf = $tmp . '/rl-' . sha1($_SERVER['REMOTE_ADDR'] ?? 'x');
$rl = @json_decode(@file_get_contents($ipf), true);
$now = time();
if (!is_array($rl) || $now - ($rl['t'] ?? 0) > 600) $rl = ['t' => $now, 'n' => 0];
$rl['n']++;
@file_put_contents($ipf, json_encode($rl), LOCK_EX);
if ($rl['n'] > 240) out(429, ['error' => 'Too many searches. Please wait a few minutes.']);

function http_get($url, $headers = [], $max = 20000000) {
  if (function_exists('curl_init')) {
    $c = curl_init($url);
    curl_setopt_array($c, [
      CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8,
      CURLOPT_HTTPHEADER => $headers, CURLOPT_USERAGENT => 'EditSupreme/1.0 (+https://editsupreme.com)',
      CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_MAXFILESIZE => $max
    ]);
    $body = curl_exec($c);
    $status = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    $type = (string)curl_getinfo($c, CURLINFO_CONTENT_TYPE);
    curl_close($c);
    return [$status, $body === false ? '' : $body, $type];
  }
  $ctx = stream_context_create(['http' => ['header' => implode("\r\n", $headers), 'timeout' => 20, 'ignore_errors' => true, 'follow_location' => 0, 'user_agent' => 'EditSupreme/1.0']]);
  $body = @file_get_contents($url, false, $ctx, 0, $max);
  $status = 0; $type = '';
  foreach ($http_response_header ?? [] as $hdr) {
    if (preg_match('#^HTTP/\S+\s+(\d{3})#', $hdr, $m)) $status = (int)$m[1];
    if (stripos($hdr, 'content-type:') === 0) $type = trim(substr($hdr, 13));
  }
  return [$status, $body === false ? '' : $body, $type];
}

$action = $_GET['action'] ?? 'status';

if ($action === 'status') {
  header('Cache-Control: public, max-age=300');
  out(200, ['sources' => array_keys($keys)]);
}

if ($action === 'search') {
  $source = $_GET['source'] ?? '';
  $q = trim((string)($_GET['q'] ?? ''));
  $page = max(1, min(50, (int)($_GET['page'] ?? 1)));
  if (!isset($keys[$source])) out(400, ['error' => 'This photo site is not set up on the server.']);
  if ($q === '' || (function_exists('mb_strlen') ? mb_strlen($q) : strlen($q)) > 100) out(400, ['error' => 'Type what to search for.']);
  // Cached for an hour: faster, and it keeps the site inside the free API limits.
  $cf = $tmp . '/s-' . sha1("$source|" . strtolower($q) . "|$page");
  if (is_readable($cf) && $now - filemtime($cf) < 3600) { header('Cache-Control: public, max-age=1800'); echo file_get_contents($cf); exit; }
  $e = rawurlencode($q);
  $photos = [];
  if ($source === 'pexels') {
    [$s, $b] = http_get("https://api.pexels.com/v1/search?query=$e&per_page=30&page=$page", ['Authorization: ' . $keys['pexels']]);
    $d = json_decode($b, true);
    if ($s !== 200 || !is_array($d)) out(502, ['error' => "Pexels answered $s."]);
    foreach ($d['photos'] ?? [] as $p) $photos[] = ['id' => 'px' . $p['id'], 'thumb' => $p['src']['medium'], 'full' => $p['src']['large2x'], 'w' => $p['width'], 'h' => $p['height'],
      'credit' => 'Photo by ' . $p['photographer'] . ' on Pexels', 'link' => $p['url'], 'license' => 'Pexels License', 'source' => 'pexels'];
  } elseif ($source === 'pixabay') {
    [$s, $b] = http_get('https://pixabay.com/api/?key=' . rawurlencode($keys['pixabay']) . "&q=$e&image_type=photo&safesearch=true&per_page=30&page=$page");
    $d = json_decode($b, true);
    if ($s !== 200 || !is_array($d)) out(502, ['error' => "Pixabay answered $s."]);
    foreach ($d['hits'] ?? [] as $p) $photos[] = ['id' => 'pb' . $p['id'], 'thumb' => $p['webformatURL'], 'full' => $p['largeImageURL'], 'w' => $p['imageWidth'], 'h' => $p['imageHeight'],
      'credit' => 'Image by ' . $p['user'] . ' on Pixabay', 'link' => $p['pageURL'], 'license' => 'Pixabay Content License', 'source' => 'pixabay', 'viaServer' => true];
  } elseif ($source === 'unsplash') {
    [$s, $b] = http_get("https://api.unsplash.com/search/photos?query=$e&per_page=30&page=$page", ['Authorization: Client-ID ' . $keys['unsplash'], 'Accept-Version: v1']);
    $d = json_decode($b, true);
    if ($s !== 200 || !is_array($d)) out(502, ['error' => "Unsplash answered $s."]);
    foreach ($d['results'] ?? [] as $p) $photos[] = ['id' => 'us' . $p['id'], 'thumb' => $p['urls']['small'], 'full' => $p['urls']['regular'], 'w' => $p['width'], 'h' => $p['height'],
      'credit' => 'Photo by ' . $p['user']['name'] . ' on Unsplash', 'link' => $p['links']['html'], 'license' => 'Unsplash License', 'source' => 'unsplash', 'pingUrl' => $p['links']['download_location']];
  }
  $json = json_encode(['photos' => $photos], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  @file_put_contents($cf, $json, LOCK_EX);
  header('Cache-Control: public, max-age=1800');
  echo $json;
  exit;
}

if ($action === 'img') {
  $url = (string)($_GET['url'] ?? '');
  $u = parse_url($url);
  $okHost = in_array(strtolower($u['host'] ?? ''), ['pixabay.com', 'cdn.pixabay.com'], true);
  if (($u['scheme'] ?? '') !== 'https' || !$okHost || !isset($keys['pixabay'])) out(400, ['error' => 'Not allowed.']);
  [$s, $b, $t] = http_get($url, ['Referer: https://pixabay.com/']);
  if ($s !== 200 || stripos($t, 'image/') !== 0) out(502, ['error' => 'Could not download that picture.']);
  header('Content-Type: ' . $t);
  header('Cache-Control: public, max-age=86400');
  echo $b;
  exit;
}

if ($action === 'ping') {
  $url = (string)($_GET['url'] ?? '');
  $u = parse_url($url);
  if (($u['scheme'] ?? '') !== 'https' || strtolower($u['host'] ?? '') !== 'api.unsplash.com' || !preg_match('#^/photos/[\w-]+/download$#', $u['path'] ?? '') || !isset($keys['unsplash'])) out(400, ['error' => 'Not allowed.']);
  http_get($url, ['Authorization: Client-ID ' . $keys['unsplash'], 'Accept-Version: v1']);
  out(200, ['ok' => true]);
}

out(400, ['error' => 'Unknown action.']);
