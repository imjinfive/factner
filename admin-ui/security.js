// createSecurity accepts the existing UI helpers. accept(authResponse) owns mandatory
// password/MFA steps and calls onAuthenticated(user) only after all checks succeed.
export function createSecurity({root,api,send,esc,submit,onAuthenticated,boot}) {
  const frame = (title,description,content) => `<main class="auth"><div class="wordmark">factner.</div><h1>${title}</h1><p class="muted">${description}</p>${content}<button id="security-logout" type="button" class="quiet">로그인 화면으로</button></main>`;
  function logoutButton() {
    root.querySelector('#security-logout')?.addEventListener('click',async()=>{
      try { await send('auth/logout',{}); } catch {}
      await boot();
    });
  }
  function auth(setup=false) {
    root.innerHTML=frame(setup?'첫 관리자 계정 만들기':'관리자 로그인',setup?'운영자 계정을 만든 뒤 인증 앱을 연결합니다.':'비밀번호와 인증 앱으로 안전하게 로그인하세요.',`<form id="auth-form">${setup?'<label>초기 설정 키<input name="setupToken" type="password" autocomplete="off" required></label><label>이름<input name="displayName" maxlength="60" required></label>':''}<label>아이디<input name="username" autocomplete="username" pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}" minlength="3" maxlength="40" required></label><label>비밀번호<input name="password" type="password" autocomplete="${setup?'new-password':'current-password'}" minlength="12" maxlength="128" required></label><small>12자 이상의 고유한 비밀번호를 사용해주세요.</small><button type="submit">${setup?'계정 만들기':'로그인'}</button></form>`);
    root.querySelector('#security-logout').remove();
    root.querySelector('#auth-form').addEventListener('submit',event=>submit(event,async data=>accept(await send(setup?'auth/setup':'auth/login',data))));
  }
  async function accept(data) {
    if (data.security.mfaRequired) return challenge();
    if (data.security.mustChangePassword) return password(null,true);
    if (data.security.mfaSetupRequired) return enrollment();
    if (data.recoveryCodes) return showRecovery(data);
    return onAuthenticated(data.user);
  }
  function challenge(recovery=false) {
    root.innerHTML=frame('2단계 인증',recovery?'보관한 일회용 복구 코드 한 개를 입력해주세요.':'인증 앱에 표시된 6자리 숫자를 입력해주세요.',`<form id="mfa-form"><label>${recovery?'복구 코드':'인증 코드'}<input name="${recovery?'recoveryCode':'code'}" ${recovery?'maxlength="24" autocomplete="off"':'inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code"'} required autofocus></label><button type="submit">확인</button></form><button id="change-method" class="secondary" type="button">${recovery?'인증 앱 사용':'인증 앱을 사용할 수 없어요'}</button>`);
    logoutButton();
    root.querySelector('#mfa-form').addEventListener('submit',event=>submit(event,async data=>accept(await send('auth/mfa/verify',data))));
    root.querySelector('#change-method').addEventListener('click',()=>challenge(!recovery));
    root.querySelector('input').focus();
  }
  function enrollment() {
    root.innerHTML=frame('인증 앱 연결','관리자 자료를 보기 전에 2단계 인증을 설정해주세요.',`<p>휴대폰의 Google Authenticator, Microsoft Authenticator 등 인증 앱에서 팩트너 계정을 추가하세요.</p><form id="begin-mfa"><button type="submit">설정 키 발급</button></form>`);
    logoutButton();
    root.querySelector('#begin-mfa').addEventListener('submit',event=>submit(event,async()=>{
      const setup=await send('auth/mfa/begin',{});
      root.innerHTML=frame('인증 앱에 등록하기','설정 키는 10분 동안 유효합니다. 다른 사람에게 공유하지 마세요.',`<ol><li>인증 앱에서 ‘설정 키 직접 입력’을 선택합니다.</li><li>계정 이름에 Factner, 키에 아래 값을 입력합니다. 유형은 ‘시간 기준’입니다.</li><li>앱에 표시된 6자리 코드를 입력합니다.</li></ol><label>설정 키<input id="totp-secret" value="${esc(setup.secret)}" readonly aria-label="인증 앱 설정 키"></label><p><a href="${esc(setup.otpauth)}">이 기기의 인증 앱에서 열기</a></p><form id="confirm-mfa"><label>인증 코드<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button type="submit">연결 확인</button></form>`);
      logoutButton();
      root.querySelector('#totp-secret').addEventListener('click',event=>event.currentTarget.select());
      root.querySelector('#confirm-mfa').addEventListener('submit',event=>submit(event,async data=>accept(await send('auth/mfa/confirm',data))));
    }));
  }
  function showRecovery(data) {
    const codes=data.recoveryCodes.join('\n');
    root.innerHTML=frame('복구 코드를 보관해주세요','휴대폰을 잃어버렸을 때 로그인할 수 있는 일회용 코드입니다. 이 화면에서만 표시됩니다.',`<label>복구 코드<textarea id="recovery-codes" rows="10" readonly>${esc(codes)}</textarea></label><button id="download-codes" class="secondary" type="button">복구 코드 파일 저장</button><form id="saved-codes"><label class="check"><input type="checkbox" required> 안전한 곳에 복구 코드를 보관했습니다.</label><button type="submit">관리 화면으로</button></form>`);
    logoutButton();
    root.querySelector('#recovery-codes').addEventListener('click',event=>event.currentTarget.select());
    root.querySelector('#download-codes').addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([`Factner 관리자 복구 코드\n아이디: ${data.user.username}\n각 코드는 한 번만 사용할 수 있습니다. 다른 사람에게 공유하지 마세요.\n\n${codes}\n`],{type:'text/plain;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='factner-recovery-codes.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    root.querySelector('#saved-codes').addEventListener('submit',event=>submit(event,async()=>onAuthenticated(data.user)));
  }
  function password(shell,mandatory=false) {
    const form=`<form id="password-form"><label>현재 비밀번호<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label><label>새 비밀번호<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>새 비밀번호 확인<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button type="submit">비밀번호 변경</button></form>`;
    if (mandatory) {
      root.innerHTML=frame('초기 비밀번호 변경','본인만 아는 12자 이상의 비밀번호로 변경해주세요. 변경 후 다시 로그인합니다.',form);logoutButton();
    } else {
      shell(`<header><div><h1>보안 설정</h1><p class="muted">비밀번호 변경 시 모든 기기에서 로그아웃됩니다.</p></div></header><section class="panel narrow"><h2>비밀번호 변경</h2>${form}</section><section class="panel narrow"><h2>인증 앱 다시 연결</h2><p>기기를 바꾸거나 복구 코드로 로그인했다면 인증 앱을 다시 연결하세요. 기존 인증 앱과 복구 코드는 모두 무효화됩니다.</p><form id="reset-mfa"><label>현재 비밀번호<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label><button type="submit" class="secondary">인증 앱 다시 설정</button></form></section>`);
      root.querySelector('#reset-mfa').addEventListener('submit',event=>submit(event,async data=>{
        if (!confirm('기존 인증 앱과 복구 코드를 해제하고 새로 설정할까요?')) return;
        await accept(await send('auth/mfa/reset',data));
      }));
    }
    root.querySelector('#password-form').addEventListener('submit',event=>submit(event,async data=>{
      if (data.newPassword!==data.confirmPassword) throw new Error('새 비밀번호가 일치하지 않습니다.');
      await send('auth/password',data);await boot();
    }));
  }
  return {auth,accept,password};
}
