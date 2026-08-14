const endpointElement = document.getElementById('endpoint');
const connectCodeElement = document.getElementById('connectCode');
const enabledElement = document.getElementById('enabled');
const statusElement = document.getElementById('status');

async function send(message) {
  return chrome.runtime.sendMessage(message);
}

async function load() {
  const values = await chrome.storage.local.get('brainOfficeSettings');
  const settings = values.brainOfficeSettings || {};
  endpointElement.value = settings.endpoint || '';
  enabledElement.checked = settings.enabled === true;
}

document.getElementById('save').addEventListener('click', async () => {
  statusElement.textContent = '연결 코드를 확인하고 있습니다…';
  const result = await send({
    type: 'configure',
    endpoint: endpointElement.value,
    connectCode: connectCodeElement.value,
    enabled: enabledElement.checked,
  });
  if (result?.error) {
    statusElement.textContent = result.error;
    return;
  }
  connectCodeElement.value = '';
  statusElement.textContent = enabledElement.checked
    ? '이 Chrome 프로필이 연결되었습니다. 팝업에서 전체 기록 읽어오기를 실행할 수 있습니다.'
    : '연결 정보가 저장되었고 수집은 일시정지 상태입니다.';
});

void load();
