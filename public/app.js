/**
 * app.js
 * 前端邏輯控制器
 * 透過 fetch() 與後端的 RESTful API 通訊，實現 CRUD (增刪查改)
 */

const form = document.getElementById('note-form');
const titleInput = document.getElementById('title');
const authorInput = document.getElementById('author');
const contentInput = document.getElementById('content');
const submitBtn = document.getElementById('submit-btn');
const refreshBtn = document.getElementById('refresh-btn');
const notesGrid = document.getElementById('notes-grid');
const loadingEl = document.getElementById('loading');
const emptyStateEl = document.getElementById('empty-state');
const noteCountEl = document.getElementById('note-count');

// 頁面載入時，立即向伺服器要求資料
document.addEventListener('DOMContentLoaded', () => {
  fetchNotes();
});

// 監聽重新整理按鈕
refreshBtn.addEventListener('click', () => {
  fetchNotes();
});

// 監聽表單送出事件
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = titleInput.value.trim();
  const author = authorInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !content) {
    alert('請輸入標題與內容！');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerText = '儲存中...';

  try {
    // 發送 POST 請求給後端 API
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, author, content })
    });

    const result = await response.json();

    if (result.success) {
      // 清空表單欄位
      titleInput.value = '';
      contentInput.value = '';
      authorInput.value = '';

      // 重新讀取最新的資料庫紀錄
      await fetchNotes();
    } else {
      alert(`新增失敗: ${result.message}`);
    }
  } catch (error) {
    console.error('送出錯誤:', error);
    alert('無法連線至伺服器，請確認後端是否正在執行！');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>寫入資料庫 💾</span>';
  }
});

// 向後端請求所有紀錄
async function fetchNotes() {
  loadingEl.classList.remove('hidden');
  emptyStateEl.classList.add('hidden');

  try {
    const response = await fetch('/api/notes');
    const result = await response.json();

    if (result.success) {
      renderNotes(result.data);
    } else {
      notesGrid.innerHTML = `<p style="color:red;text-align:center;">讀取失敗：${result.message}</p>`;
    }
  } catch (error) {
    console.error('讀取錯誤:', error);
    notesGrid.innerHTML = `
      <div style="text-align:center; padding: 2rem; color: #ef4444;">
        <p>⚠️ 無法連接至後端伺服器 (http://localhost:3000)</p>
        <p style="font-size: 0.85rem; color: #64748b; margin-top: 0.5rem;">
          請先在終端機執行 <code>npm start</code> 啟動伺服器後再重試！
        </p>
      </div>
    `;
  } finally {
    loadingEl.classList.add('hidden');
  }
}

// 將資料陣列渲染成 HTML 元素
function renderNotes(notes) {
  noteCountEl.innerText = notes.length;
  notesGrid.innerHTML = '';

  if (notes.length === 0) {
    emptyStateEl.classList.remove('hidden');
    return;
  }

  notes.forEach((note) => {
    const noteCard = document.createElement('div');
    noteCard.className = 'note-item';

    // 格式化時間 (UTC to Local)
    const formattedDate = new Date(note.created_at).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    noteCard.innerHTML = `
      <div class="note-header">
        <h3 class="note-title">${escapeHtml(note.title)}</h3>
        <button class="delete-btn" title="刪除此筆紀錄" onclick="deleteNote(${note.id})">🗑️</button>
      </div>
      <p class="note-content">${escapeHtml(note.content)}</p>
      <div class="note-meta">
        <span class="note-author">👤 ${escapeHtml(note.author || '匿名')}</span>
        <span class="note-time">🕒 ${formattedDate}</span>
      </div>
    `;

    notesGrid.appendChild(noteCard);
  });
}

// 刪除指定的紀錄
async function deleteNote(id) {
  if (!confirm('確定要從資料庫中永久刪除這筆紀錄嗎？')) {
    return;
  }

  try {
    const response = await fetch(`/api/notes/${id}`, {
      method: 'DELETE'
    });

    const result = await response.json();
    if (result.success) {
      await fetchNotes();
    } else {
      alert(`刪除失敗: ${result.message}`);
    }
  } catch (error) {
    console.error('刪除錯誤:', error);
    alert('無法與伺服器連線');
  }
}

// 簡易防止 XSS 的工具函式
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
