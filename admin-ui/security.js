export function createSecurity({root,send,submit,onAuthenticated,boot}) {
  const frame = (title,content) => `<main class="auth"><div class="wordmark">factner.</div><h1>${title}</h1>${content}</main>`;
  function auth(setup=false) {
    root.innerHTML=frame(setup?'첫 관리자 계정 만들기':'관리자 로그인',`<form id="auth-form">${setup?'<label>초기 설정 키<input name="setupToken" type="password" autocomplete="off" required></label><label>이름<input name="displayName" maxlength="60" required></label>':''}<label>아이디<input name="username" autocomplete="username" pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}" minlength="3" maxlength="40" required></label><label>비밀번호<input name="password" type="password" autocomplete="${setup?'new-password':'current-password'}" ${setup?'minlength="12"':''} maxlength="128" required></label><button type="submit">${setup?'계정 만들기':'로그인'}</button></form>`);
    root.querySelector('#auth-form').addEventListener('submit',event=>submit(event,async data=>accept(await send(setup?'auth/setup':'auth/login',data))));
  }
  async function accept(data) {
    if (data.security.mustChangePassword) return password(null,true);
    return onAuthenticated(data.user);
  }
  function password(shell,mandatory=false) {
    const form=`<form id="password-form"><label>현재 비밀번호<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label><label>새 비밀번호<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>새 비밀번호 확인<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button type="submit">비밀번호 변경</button></form>`;
    if (mandatory) {
      root.innerHTML=frame('초기 비밀번호 변경',`${form}<button id="security-logout" type="button" class="quiet">로그인 화면으로</button>`);
      root.querySelector('#security-logout').addEventListener('click',async()=>{
        try { await send('auth/logout',{}); } catch {}
        await boot();
      });
    } else {
      shell(`<header><div><h1>비밀번호 변경</h1><p class="muted">변경하면 모든 기기에서 로그아웃됩니다.</p></div></header><section class="panel narrow">${form}</section>`);
    }
    root.querySelector('#password-form').addEventListener('submit',event=>submit(event,async data=>{
      if (data.newPassword!==data.confirmPassword) throw new Error('새 비밀번호가 일치하지 않습니다.');
      await send('auth/password',data);await boot();
    }));
  }
  return {auth,accept,password};
}
