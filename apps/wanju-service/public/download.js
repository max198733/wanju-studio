const status = document.getElementById('manifest-status');
fetch('/downloads.json', { cache: 'no-store' }).then((response) => {
  if (!response.ok) throw new Error('Release metadata unavailable.');
  return response.json();
}).then((manifest) => {
  const release = manifest.desktop;
  if (!release || !/^[a-f0-9]{64}$/i.test(release.sha256) || !Number.isSafeInteger(release.bytes)
    || !/^\/releases\/[\w.-]+\.exe$/.test(release.href)) throw new Error('Invalid release metadata.');
  document.getElementById('desktop-version').textContent = `v${release.version}`;
  document.getElementById('desktop-meta').textContent = `Windows x64 · ${(release.bytes / 1048576).toFixed(1)} MiB · ${release.released}`;
  document.getElementById('desktop-sha').textContent = release.sha256;
  const link = document.getElementById('desktop-download');
  link.href = release.href; link.download = release.name; link.textContent = '下载玩剧 Windows 版'; link.removeAttribute('aria-disabled');
}).catch(() => {
  status.textContent = '暂时无法读取下载信息，请刷新后重试。';
  document.getElementById('desktop-meta').textContent = 'Windows x64 安装程序';
  document.getElementById('desktop-sha').textContent = '暂时无法读取';
});
