/**
 * yaNote - JSON Import/Export Modal
 */

/**
 * JSON用のポップアップモーダルを表示します
 */
export function showJsonModal(app) {
    let modal = document.getElementById('jsonModal');
    let overlay = document.getElementById('jsonModalOverlay');

    if (!modal) {
        overlay = document.createElement('div');
        overlay.id = 'jsonModalOverlay';
        overlay.className = 'modal-overlay';
        overlay.onclick = () => { modal.style.display = 'none'; overlay.style.display = 'none'; };
        document.body.appendChild(overlay);

        modal = document.createElement('div');
        modal.id = 'jsonModal';
        modal.className = 'modal';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--color-bg-primary,#fff);border-radius:10px;padding:24px;width:90%;max-width:600px;z-index:30001;display:none;box-shadow:0 10px 30px rgba(0,0,0,0.5);border:1px solid var(--color-border,rgba(0,0,0,0.1));';
        modal.innerHTML = `
            <style>
                #jsonModal button {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 3px;
                    background: var(--color-surface, #ddd);
                    color: var(--color-text-primary, #404040);
                    cursor: pointer;
                    font-weight: bold;
                    transition: background var(--transition-fast, 120ms);
                }
                #jsonModal button:hover {
                    background: var(--color-surface-hover, #d0d0d0);
                }
                #jsonModal button:active {
                    background: var(--color-surface-active, #c5c5c5);
                }
            </style>
            <h3 style="margin-top:0;color:var(--color-text-primary);">JSON データ入出力</h3>
            <p style="font-size:13px;color:var(--color-text-secondary);">テキストエリアの JSON をコピーしてバックアップしたり、別の JSON を貼り付けて読み込むことができます。</p>
            <textarea id="jsonTextArea" style="width:100%;height:300px;font-family:monospace;font-size:12px;padding:10px;border-radius:6px;border:1px solid var(--color-border,#ccc);background:var(--color-bg,#f9f9f9);color:var(--color-text-primary);box-sizing:border-box;margin-bottom:16px;"></textarea>
            <div id="jsonModalResult" style="margin-bottom:12px;padding:8px;border-radius:4px;display:none;font-size:13px;"></div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button id="jsonModalCloseBtn">閉じる</button>
                <button id="jsonModalCopyBtn">コピー</button>
                <button id="jsonModalLoadBtn" style="background:var(--color-accent, #4f46e5); color:#fff;">リロード</button>
            </div>
        `;
        document.body.appendChild(modal);

        // クローズ処理
        document.getElementById('jsonModalCloseBtn').onclick = () => {
            modal.style.display = 'none';
            overlay.style.display = 'none';
        };

        // コールバック登録: コピー
        document.getElementById('jsonModalCopyBtn').onclick = async () => {
            const textArea = document.getElementById('jsonTextArea');
            try {
                await navigator.clipboard.writeText(textArea.value);
                showResult('✅ クリップボードにコピーしました', 'success');
            } catch (err) {
                showResult('❌ コピーに失敗しました', 'error');
            }
        };

        // コールバック登録: ロード
        document.getElementById('jsonModalLoadBtn').onclick = () => {
            const textArea = document.getElementById('jsonTextArea');
            try {
                const json = JSON.parse(textArea.value);
                if (json.nodes && Array.isArray(json.nodes)) {
                    app.restoreState(json);
                    app.saveState();
                    showResult('✅ ロード完了しました', 'success');
                    setTimeout(() => {
                        modal.style.display = 'none';
                        overlay.style.display = 'none';
                    }, 1000);
                } else {
                    showResult('❌ 有効な yaNote データではありません', 'error');
                }
            } catch (err) {
                showResult('❌ JSONの書式が正しくありません', 'error');
            }
        };

        function showResult(msg, type) {
            const resEl = document.getElementById('jsonModalResult');
            resEl.textContent = msg;
            resEl.style.display = 'block';
            resEl.style.background = type === 'success' ? '#d1fae5' : '#fee2e2';
            resEl.style.color = type === 'success' ? '#065f46' : '#991b1b';
            setTimeout(() => { resEl.style.display = 'none'; }, 3000);
        }
    }

    // 表示時の処理
    const state = app.captureState();
    const textArea = document.getElementById('jsonTextArea');
    textArea.value = JSON.stringify(state, null, 2);
    document.getElementById('jsonModalResult').style.display = 'none';

    overlay.style.display = 'block';
    modal.style.display = 'block';

    textArea.select();
}
