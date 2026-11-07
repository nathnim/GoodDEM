/* admin.js — Trang quản trị tài khoản. Quyền được máy chủ kiểm tra cho từng thao tác. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = Auth.esc, R = Auth.ROLE_VI;
  let ME = null, USERS = [], editing = null, bulkOut = [], ROLE = '';
  const ACT = {
    login: 'Đăng nhập', login_fail: 'Sai mật khẩu', change_password: 'Đổi mật khẩu', run: 'Dựng địa hình',
    export_xml: 'Xuất LandXML', export_asc: 'Xuất DEM .asc', export_dxf: 'Xuất DXF', export_csv: 'Xuất điểm CSV',
    export_geojson: 'Xuất GeoJSON', export_zip: 'Xuất trọn bộ .zip', create_user: 'Tạo tài khoản', bulk_create: 'Tạo hàng loạt',
    update_user: 'Sửa tài khoản', update_limits: 'Đổi giới hạn sinh viên', reset_password: 'Cấp lại mật khẩu', delete_user: 'Xóa tài khoản'
  };

  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Đã sao chép'); }
    catch (e) { toast('Không sao chép được, hãy bôi đen và Ctrl+C'); }
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  const csvCell = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

  /* ---------- Tab ---------- */
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    ['users', 'bulk', 'logs', 'limits'].forEach(t => $('tab-' + t).hidden = t !== b.dataset.tab);
    if (b.dataset.tab === 'logs' && !$('ltbody').children.length) loadLogs();
  }));

  /* ---------- Thống kê ---------- */
  async function loadStats(pre) {
    try {
      const s = pre || (await Auth.api('stats')).stats;
      const items = ME.role === 'admin'
        ? [[s.total, 'Tài khoản'], [s.by.admin, 'Quản trị'], [s.by.teacher, 'Giảng viên'], [s.by.student, 'Sinh viên']]
        : [[s.by.student, 'Sinh viên đã cấp']];
      items.push([s.locked + s.expired, 'Khóa hoặc hết hạn', s.locked + s.expired > 0], [s.active7, 'Người dùng (7 ngày)'], [s.runs7, 'Lượt dựng địa hình (7 ngày)'], [s.exports7, 'Lượt xuất file (7 ngày)']);
      $('stats').innerHTML = items.map(([v, l, w]) => `<div class="stat${w ? ' warn' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
    } catch (e) { $('stats').innerHTML = `<div class="stat"><span>${esc(e.message)}</span></div>`; }
  }

  /* ---------- Danh sách tài khoản ---------- */
  async function loadUsers() {
    $('utbody').innerHTML = '<tr class="empty-row"><td colspan="9">Đang tải…</td></tr>';
    try { USERS = (await Auth.api('listUsers')).users; renderUsers(); }
    catch (e) { $('utbody').innerHTML = `<tr class="empty-row"><td colspan="9">${esc(e.message)}</td></tr>`; }
  }
  function statusOf(u) {
    if (u.status === 'locked') return ['locked', 'Bị khóa'];
    if (u.expired) return ['expired', 'Hết hạn'];
    if (u.mustChange) return ['must', 'Chưa đổi MK'];
    return ['active', 'Đang dùng'];
  }
  function renderUsers() {
    const q = $('fq').value.trim().toLowerCase(), fr = ROLE, fs = $('fstat').value;
    document.querySelectorAll('#roleSeg [data-n]').forEach(b => { const r = b.dataset.n; b.textContent = r ? USERS.filter(u => u.role === r).length : USERS.length; });
    const list = USERS.filter(u => (!fr || u.role === fr) && (!fs || statusOf(u)[0] === fs) &&
      (!q || [u.email, u.name, u.note, u.createdBy].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => ['admin', 'teacher', 'student'].indexOf(a.role) - ['admin', 'teacher', 'student'].indexOf(b.role) || a.email.localeCompare(b.email));
    $('ucount').textContent = `${list.length} / ${USERS.length} tài khoản`;
    if (!list.length) { $('utbody').innerHTML = '<tr class="empty-row"><td colspan="9">Không có tài khoản phù hợp.</td></tr>'; return; }
    $('utbody').innerHTML = list.map(u => {
      const [sk, sl] = statusOf(u), self = u.email === ME.email;
      return `<tr data-e="${esc(u.email)}">
        <td class="mono">${esc(u.email)}</td><td>${esc(u.name)}</td>
        <td><span class="chip r-${u.role}">${R[u.role] || u.role}</span></td>
        <td><span class="chip c-${sk}">${sl}</span></td>
        <td class="mono">${esc(u.expires || '—')}</td>
        <td class="mono">${u.lastLogin ? esc(u.lastLogin.slice(0, 16)) + ' · ' + u.loginCount + ' lần' : '—'}</td>
        <td class="mono">${esc(u.createdBy)}</td>
        <td class="wrap-cell">${esc(u.note)}</td>
        <td><div class="acts">${self ? '<span class="muted">(bạn)</span>' : `
          <button type="button" data-a="edit">Sửa</button>
          <button type="button" data-a="reset" title="Cấp lại mật khẩu tạm">Mật khẩu</button>
          <button type="button" data-a="lock">${u.status === 'locked' ? 'Mở khóa' : 'Khóa'}</button>
          <button type="button" data-a="del" class="del">Xóa</button>`}</div></td></tr>`;
    }).join('');
  }
  ['fq', 'fstat'].forEach(id => $(id).addEventListener('input', renderUsers));
  document.querySelectorAll('#roleSeg button').forEach(b => b.addEventListener('click', () => {
    ROLE = b.dataset.role;
    document.querySelectorAll('#roleSeg button').forEach(x => x.setAttribute('aria-selected', x === b));
    renderUsers();
  }));
  $('btnReload').addEventListener('click', async () => {
    $('utbody').innerHTML = '<tr class="empty-row"><td colspan="9">Đang tải…</td></tr>';
    try { const j = await Auth.api('boot', { want: 'admin' }); USERS = j.users; renderUsers(); loadStats(j.stats); }
    catch (e) { toast(e.message); }
  });

  $('utbody').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const email = b.closest('tr').dataset.e, u = USERS.find(x => x.email === email), a = b.dataset.a;
    if (a === 'edit') return openUser(u);
    if (a === 'reset') {
      if (!confirm(`Cấp lại mật khẩu cho ${email}? Mật khẩu cũ sẽ không dùng được nữa.`)) return;
      try { const j = await Auth.api('resetPassword', { email }); showPw(email, j.password); refresh(); } catch (x) { toast(x.message); }
    }
    if (a === 'lock') {
      const to = u.status === 'locked' ? 'active' : 'locked';
      try { await Auth.api('updateUser', { email, status: to }); toast(to === 'locked' ? 'Đã khóa ' + email : 'Đã mở khóa ' + email); refresh(); } catch (x) { toast(x.message); }
    }
    if (a === 'del') {
      if (!confirm(`Xóa vĩnh viễn tài khoản ${email}? Nhật ký cũ vẫn được giữ.`)) return;
      try { await Auth.api('deleteUser', { email }); toast('Đã xóa ' + email); refresh(); } catch (x) { toast(x.message); }
    }
  });

  /** Làm mới bảng và số liệu trong một lượt gọi máy chủ */
  async function refresh() {
    try { const j = await Auth.api('boot', { want: 'admin' }); USERS = j.users; renderUsers(); loadStats(j.stats); }
    catch (e) { toast(e.message); }
  }

  /* ---------- Hộp thoại thêm / sửa ---------- */
  function openUser(u) {
    editing = u || null;
    $('dlgUserTitle').textContent = u ? 'Sửa tài khoản' : 'Thêm tài khoản';
    $('uEmail').value = u ? u.email : ''; $('uEmail').disabled = !!u;
    $('uName').value = u ? u.name : '';
    $('uRole').value = u ? u.role : (ME.role !== 'admin' ? 'student' : ROLE || 'teacher');
    $('uRole').disabled = ME.role !== 'admin';
    $('uExp').value = u ? u.expires || '' : '';
    $('uStat').value = u ? u.status : 'active'; $('uStatWrap').hidden = !u;
    $('uPwWrap').hidden = !!u; $('uPw').value = '';
    $('uNote').value = u ? u.note || '' : '';
    $('uErr').hidden = true;
    $('dlgUser').showModal();
  }
  $('btnAdd').addEventListener('click', () => openUser(null));
  $('uCancel').addEventListener('click', () => $('dlgUser').close());
  $('fUser').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('uSave'); btn.disabled = true; $('uErr').hidden = true;
    const data = { name: $('uName').value.trim(), expires: $('uExp').value, note: $('uNote').value.trim() };
    if (ME.role === 'admin') data.role = $('uRole').value;
    try {
      if (editing) {
        data.email = editing.email; data.status = $('uStat').value;
        await Auth.api('updateUser', data); $('dlgUser').close(); toast('Đã lưu');
      } else {
        data.email = $('uEmail').value.trim(); if ($('uPw').value) data.password = $('uPw').value;
        if (data.password && data.password.length < 8) throw new Error('Mật khẩu tạm phải từ 8 ký tự.');
        const j = await Auth.api('createUser', data); $('dlgUser').close(); showPw(j.user.email, j.password);
      }
      refresh();
    } catch (x) { $('uErr').textContent = x.message; $('uErr').hidden = false; }
    btn.disabled = false;
  });

  function showPw(email, pw) {
    $('pwFor').textContent = email; $('pwVal').textContent = pw; $('dlgPw').showModal();
  }
  $('pwCopy').addEventListener('click', () => copy(`Tài khoản Địa hình số DEM\nĐịa chỉ: ${location.href.replace(/admin\.html.*$/, '')}\nEmail: ${$('pwFor').textContent}\nMật khẩu tạm: ${$('pwVal').textContent}`));
  $('pwClose').addEventListener('click', () => $('dlgPw').close());

  /* ---------- Cấp hàng loạt ---------- */
  function parseBulk() {
    const rows = [], bad = [];
    $('bulkText').value.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim(); if (!t) return;
      const parts = t.split(/\t|,|;/).map(s => s.trim()).filter(Boolean);
      const ei = parts.findIndex(p => /@/.test(p));
      if (ei < 0) { bad.push(i + 1); return; }
      const email = parts[ei], name = parts.filter((_, k) => k !== ei).join(' ');
      rows.push({ email, name });
    });
    return { rows, bad };
  }
  $('bulkText').addEventListener('input', () => {
    const { rows, bad } = parseBulk();
    $('bulkPreview').textContent = rows.length ? `${rows.length} dòng hợp lệ` + (bad.length ? `; bỏ qua dòng ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''} (không có email)` : '') : 'Chưa có dòng hợp lệ.';
  });
  $('btnBulk').addEventListener('click', async () => {
    const { rows } = parseBulk(), btn = $('btnBulk');
    $('bulkErr').hidden = true;
    if (!rows.length) { $('bulkErr').textContent = 'Dán danh sách email trước.'; $('bulkErr').hidden = false; return; }
    if (rows.length > 500) { $('bulkErr').textContent = 'Mỗi lần tối đa 500 tài khoản.'; $('bulkErr').hidden = false; return; }
    btn.disabled = true; btn.textContent = `Đang tạo ${rows.length} tài khoản…`;
    try {
      const j = await Auth.api('bulkCreate', { rows, role: $('bulkRole').value, expires: $('bulkExp').value, note: $('bulkNote').value.trim() });
      bulkOut = j.results;
      const ok = bulkOut.filter(r => r.ok).length;
      $('bulkRes').innerHTML = bulkOut.map(r => r.ok
        ? `<tr><td class="mono">${esc(r.email)}</td><td>${esc(r.name)}</td><td class="mono"><b>${esc(r.password)}</b></td></tr>`
        : `<tr><td class="mono">${esc(r.email)}</td><td>${esc(r.name)}</td><td style="color:var(--bad);white-space:normal">${esc(r.error)}</td></tr>`).join('');
      $('btnBulkCsv').disabled = $('btnBulkCopy').disabled = !ok;
      toast(`Đã tạo ${ok}/${bulkOut.length} tài khoản`);
      refresh();
    } catch (x) { $('bulkErr').textContent = x.message; $('bulkErr').hidden = false; }
    btn.disabled = false; btn.textContent = 'Tạo tài khoản';
  });
  const bulkLines = () => bulkOut.filter(r => r.ok).map(r => [r.email, r.name, r.password]);
  $('btnBulkCsv').addEventListener('click', () => {
    const lines = [['Email', 'Họ tên', 'Mật khẩu tạm']].concat(bulkLines()).map(r => r.map(csvCell).join(','));
    download('Tai_khoan_DEM_' + new Date().toISOString().slice(0, 10) + '.csv', lines.join('\r\n'));
  });
  $('btnBulkCopy').addEventListener('click', () => copy(bulkLines().map(r => r.join('\t')).join('\n')));

  /* ---------- Nhật ký ---------- */
  async function loadLogs() {
    $('ltbody').innerHTML = '<tr class="empty-row"><td colspan="5">Đang tải…</td></tr>';
    try {
      const L = (await Auth.api('logs', { email: $('lq').value.trim(), limit: +$('llimit').value })).logs;
      $('ltbody').innerHTML = L.length ? L.map(l => `<tr><td class="mono">${esc(l.time)}</td><td class="mono">${esc(l.email)}</td>
        <td><span class="chip r-${esc(l.role)}">${R[l.role] || esc(l.role)}</span></td>
        <td${l.action === 'login_fail' ? ' style="color:var(--bad)"' : ''}>${ACT[l.action] || esc(l.action)}</td><td class="wrap-cell">${esc(l.detail)}</td></tr>`).join('')
        : '<tr class="empty-row"><td colspan="5">Chưa có nhật ký.</td></tr>';
    } catch (e) { $('ltbody').innerHTML = `<tr class="empty-row"><td colspan="5">${esc(e.message)}</td></tr>`; }
  }
  $('btnLogs').addEventListener('click', loadLogs);
  $('lq').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadLogs(); });

  /* ---------- Giới hạn sinh viên (chỉ quản trị) ---------- */
  let LIM_DEFAULTS = null;
  function fillLimits(L) {
    $('limOn').checked = !!L.enabled; $('limArea').value = L.maxAreaKm2; $('limCell').value = L.minCellM; $('limQuota').value = L.exportsPerDay;
    document.querySelectorAll('[name=limSrc]').forEach(c => c.checked = L.sources.includes(c.value));
    document.querySelectorAll('[name=limFmt]').forEach(c => c.checked = L.formats.includes(c.value));
  }
  $('limDefault').addEventListener('click', async () => {
    try { if (!LIM_DEFAULTS) LIM_DEFAULTS = (await Auth.api('getSettings')).defaults; fillLimits(LIM_DEFAULTS); toast('Đã điền giá trị mặc định, bấm Lưu để áp dụng'); }
    catch (e) { toast(e.message); }
  });
  $('fLim').addEventListener('submit', async (e) => {
    e.preventDefault(); $('limErr').hidden = true; const btn = $('limSave'); btn.disabled = true;
    const pick = (n) => [...document.querySelectorAll('[name=' + n + ']:checked')].map(c => c.value);
    try {
      const j = await Auth.api('saveSettings', { limits: { enabled: $('limOn').checked, maxAreaKm2: +$('limArea').value, minCellM: +$('limCell').value,
        exportsPerDay: +$('limQuota').value, sources: pick('limSrc'), formats: pick('limFmt') } });
      fillLimits(j.limits); toast('Đã lưu. Sinh viên nhận giới hạn mới ở lần mở ứng dụng kế tiếp.');
    } catch (x) { $('limErr').textContent = x.message; $('limErr').hidden = false; }
    btn.disabled = false;
  });

  /* ---------- Khởi động ---------- */
  Auth.boot({
    roles: ['admin', 'teacher'],
    want: 'admin',
    loadingText: 'Đang tải danh sách tài khoản…',
    async onReady(user, p) {
      ME = user;
      USERS = p.users || (await Auth.api('listUsers')).users;
      Auth.unlock();
      if (ME.role !== 'admin') { $('bulkRoleWrap').hidden = true; $('roleSeg').hidden = true; }
      if (ME.role === 'admin' && p.limits) { $('tabLimits').hidden = false; fillLimits(p.limits); }
      renderUsers(); loadStats(p.stats);
    }
  });
})();
