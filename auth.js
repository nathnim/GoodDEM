/* auth.js — Đăng nhập, phiên làm việc, đổi mật khẩu, thanh người dùng.
 * Mọi kiểm tra quyền thực hiện ở máy chủ (Apps Script); tệp này chỉ là giao diện. */
(function () {
  'use strict';
  const CFG = window.DEM_CONFIG || {};
  const KEY = 'dem_session';
  const ROLE_VI = { admin: 'Quản trị', teacher: 'Giảng viên', student: 'Sinh viên' };
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { (v.remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(v)); } catch (e) { } },
    clear() { try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { } }
  };
  let sess = store.get();
  let opts = {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(action, data) {
    if (!CFG.API_URL || /DAN_URL/.test(CFG.API_URL)) throw new Error('Chưa cấu hình địa chỉ máy chủ (API_URL trong config.js).');
    let r;
    try {
      r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, token: sess && sess.token }, data || {})) });
    } catch (e) { throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'); }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('Máy chủ trả về dữ liệu không đọc được (mã ' + r.status + ').'); }
    if (!j.ok) {
      const e = new Error(j.error || 'Lỗi máy chủ'); e.code = j.code;
      if (j.code === 'AUTH') { store.clear(); sess = null; }
      throw e;
    }
    return j;
  }

  /* ---------- Giao diện cổng ---------- */
  function gate() { return $('gate'); }
  function card(html) {
    gate().hidden = false;
    gate().innerHTML = `<div class="gate-card" role="dialog" aria-modal="true" aria-labelledby="gTitle">
      <div class="gate-brand"><b>Địa hình số DEM</b><span>Dữ liệu địa hình cho ADS Civil, Civil 3D</span></div>${html}
      <p class="gate-copy"><b>© TS. Đặng Minh Tân</b>, Bộ môn Đường bộ – Sân bay | Khoa Công trình và Môi trường | Trường Đại học Giao thông Vận tải</p></div>`;
  }
  function setErr(msg) { const e = $('gErr'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } }
  function busy(btn, on, text) { if (!btn) return; btn.disabled = on; if (text) btn.textContent = text; }

  function showLogin(msg) {
    card(`<h2 id="gTitle">Đăng nhập</h2>
      <p class="gate-sub">Dùng tài khoản do quản trị viên hoặc giảng viên cấp.</p>
      <form id="gForm" novalidate>
        <label class="gf">Email<input type="email" id="gEmail" autocomplete="username" required></label>
        <label class="gf">Mật khẩu<input type="password" id="gPw" autocomplete="current-password" required></label>
        <label class="gchk"><input type="checkbox" id="gRem"> Ghi nhớ đăng nhập trên máy này</label>
        <p class="gate-err" id="gErr" hidden></p>
        <button class="primary" id="gBtn" type="submit">Đăng nhập</button>
      </form>
      <p class="gate-foot">Quên mật khẩu: liên hệ giảng viên hoặc quản trị viên để được cấp lại.</p>`);
    if (msg) setErr(msg);
    try { $('gEmail').value = localStorage.getItem('dem_last_email') || ''; } catch (e) { }
    ($('gEmail').value ? $('gPw') : $('gEmail')).focus();
    $('gForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('gEmail').value.trim(), pw = $('gPw').value, btn = $('gBtn');
      if (!email || !pw) return setErr('Nhập email và mật khẩu.');
      setErr(''); busy(btn, true, 'Đang kiểm tra…');
      try {
        const j = await api('login', { email, password: pw, want: opts.want });
        sess = { token: j.token, user: j.user, remember: $('gRem').checked };
        store.set(sess);
        try { localStorage.setItem('dem_last_email', email); } catch (x) { }
        if (j.user.mustChange) showChange(true, pw); else await ready(j);
      } catch (x) { setErr(x.message); busy(btn, false, 'Đăng nhập'); }
    });
  }

  function showChange(forced, oldPw) {
    card(`<h2 id="gTitle">${forced ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}</h2>
      <p class="gate-sub">${forced ? 'Đây là lần đăng nhập đầu hoặc mật khẩu vừa được cấp lại. Hãy đặt mật khẩu riêng của bạn.' : esc(sess.user.email)}</p>
      <form id="gForm" novalidate>
        <label class="gf" ${oldPw ? 'hidden' : ''}>Mật khẩu hiện tại<input type="password" id="gOld" autocomplete="current-password"></label>
        <label class="gf">Mật khẩu mới (ít nhất 8 ký tự)<input type="password" id="gNew" autocomplete="new-password" minlength="8"></label>
        <label class="gf">Nhập lại mật khẩu mới<input type="password" id="gNew2" autocomplete="new-password"></label>
        <p class="gate-err" id="gErr" hidden></p>
        <button class="primary" id="gBtn" type="submit">Lưu mật khẩu</button>
        ${forced ? '<button type="button" class="linkbtn" id="gOut">Đăng xuất</button>' : '<button type="button" class="linkbtn" id="gCancel">Hủy</button>'}
      </form>`);
    if (oldPw) $('gOld').value = oldPw;
    $(oldPw ? 'gNew' : 'gOld').focus();
    if ($('gOut')) $('gOut').addEventListener('click', logout);
    if ($('gCancel')) $('gCancel').addEventListener('click', () => { gate().hidden = true; });
    $('gForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const o = $('gOld').value, n = $('gNew').value, n2 = $('gNew2').value, btn = $('gBtn');
      if (n.length < 8) return setErr('Mật khẩu mới phải từ 8 ký tự.');
      if (n !== n2) return setErr('Hai lần nhập mật khẩu mới không khớp.');
      if (n === o) return setErr('Mật khẩu mới phải khác mật khẩu cũ.');
      setErr(''); busy(btn, true, 'Đang lưu…');
      try {
        const j = await api('changePassword', { oldPassword: o, newPassword: n, want: forced ? opts.want : undefined });
        sess.token = j.token; sess.user = j.user; store.set(sess);
        if (forced) await ready(j); else { gate().hidden = true; renderBar(); }
      } catch (x) { setErr(x.message); busy(btn, false, 'Lưu mật khẩu'); }
    });
  }

  function showStatus(msg, isErr) {
    card(`<h2 id="gTitle">${isErr ? 'Không mở được ứng dụng' : 'Đang mở ứng dụng'}</h2>
      <p class="${isErr ? 'gate-err' : 'gate-sub'}">${esc(msg)}</p>
      ${isErr ? '<button class="primary" id="gRetry" type="button">Thử lại</button><button type="button" class="linkbtn" id="gOut">Đăng xuất</button>' : '<div class="gate-spin" aria-hidden="true"></div>'}`);
    if (isErr) { $('gRetry').addEventListener('click', start); $('gOut').addEventListener('click', logout); }
  }

  /** p: dữ liệu máy chủ trả kèm (mã lõi hoặc danh sách quản trị) — tránh thêm một lượt gọi */
  async function ready(p) {
    const u = sess.user;
    if (opts.roles && !opts.roles.includes(u.role)) {
      card(`<h2 id="gTitle">Không có quyền truy cập</h2>
        <p class="gate-sub">Tài khoản ${esc(u.email)} (${ROLE_VI[u.role] || u.role}) không được vào trang này.</p>
        <a class="primary" href="index.html" style="text-align:center;text-decoration:none">Về ứng dụng</a>
        <button type="button" class="linkbtn" id="gOut">Đăng xuất</button>`);
      $('gOut').addEventListener('click', logout);
      return;
    }
    showStatus(opts.loadingText || 'Đang nạp dữ liệu…');
    try { await opts.onReady(u, p || {}); }
    catch (x) {
      if (x.code === 'AUTH') return showLogin(x.message);
      if (x.code === 'MUST_CHANGE') return showChange(true);
      return showStatus(x.message, true);
    }
  }

  function unlock() {
    gate().hidden = true; document.body.classList.remove('locked'); renderBar();
  }

  function renderBar() {
    const bar = $('userbar'); if (!bar || !sess) return;
    const u = sess.user, onAdmin = /admin\.html/.test(location.pathname);
    const manage = (u.role === 'admin' || u.role === 'teacher');
    bar.innerHTML = `<span class="ub-name" title="${esc(u.email)}">${esc(u.name || u.email)}</span>
      <span class="ub-role ub-${u.role}">${ROLE_VI[u.role] || u.role}</span>
      ${manage && !onAdmin ? '<a href="admin.html" class="ub-link">Quản trị</a>' : ''}
      ${onAdmin ? '<a href="index.html" class="ub-link">Về ứng dụng</a>' : ''}
      <button type="button" class="ub-link" id="ubPw">Đổi mật khẩu</button>
      <button type="button" class="ub-link" id="ubOut">Đăng xuất</button>`;
    $('ubPw').addEventListener('click', () => showChange(false));
    $('ubOut').addEventListener('click', logout);
  }

  function logout() { store.clear(); sess = null; location.reload(); }

  async function start() {
    document.body.classList.add('locked');
    if (!sess) return showLogin();
    showStatus('Đang kiểm tra phiên đăng nhập…');
    try {
      const j = await api('boot', { want: opts.want });
      sess.user = j.user; store.set(sess);
      if (j.user.mustChange) return showChange(true);
      await ready(j);
    } catch (x) {
      if (x.code === 'AUTH' || !sess) showLogin(x.message);
      else showStatus(x.message, true);
    }
  }

  window.Auth = {
    api, unlock, logout, ROLE_VI, esc,
    user: () => sess && sess.user,
    /** Ghi nhật ký, không chặn giao diện */
    log(act, detail) { api('log', { act, detail }).catch(() => { }); },
    boot(o) { opts = o || {}; start(); }
  };
})();
