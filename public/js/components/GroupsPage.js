/**
 * Groups — live community chat (WhatsApp-style)
 */

import { UserLayout } from '../utils/UserLayout.js';

export class GroupsPage {
  constructor() {
    this.user = null;
    this.groups = [];
    this.groupMessages = [];
    this.activeGroup = 'main';
    this.pendingImagePreview = null;
  }

  esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async loadGroups() {
    const data = await fetch('/api/social/groups').then((r) => r.json());
    if (data.success) this.groups = data.groups;
  }

  async loadMessages() {
    const data = await fetch(`/api/social/groups/${this.activeGroup}/messages`).then((r) => r.json());
    if (data.success) this.groupMessages = data.messages;
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async sendMsg() {
    const text = document.getElementById('groupMsgInput')?.value?.trim() || '';
    const file = document.getElementById('groupImage')?.files?.[0];
    let imageData = null;
    if (file) imageData = await this.fileToDataUrl(file);
    if (!text && !imageData) return;
    const res = await fetch(`/api/social/groups/${this.activeGroup}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, imageData })
    });
    const data = await res.json();
    if (!data.success) return alert(data.error?.message || 'Failed');
    document.getElementById('groupMsgInput').value = '';
    this.pendingImagePreview = null;
    await this.loadMessages();
    this.render();
  }

  renderBody() {
    const g = this.groups.find((x) => x.id === this.activeGroup) || this.groups[0];
    return `
      <a href="/post" class="text-primary text-sm font-bold uppercase mb-4 inline-block"><i class="fas fa-arrow-left"></i> Post feed</a>
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 group-chat-layout">
        <aside class="glass-card p-3 lg:col-span-1">
          <p class="stat-label mb-2">Groups</p>
          ${this.groups.map((gr) => `
            <button type="button" data-gid="${gr.id}" class="group-list-btn w-full text-left py-2 px-3 rounded-lg mb-1 ${gr.id === this.activeGroup ? 'is-active' : ''}">
              ${this.esc(gr.name)}<br>
              <span class="text-[10px] text-gray-500">${gr.activeCount || 0} active · ${gr.messageCount || 0} msgs</span>
            </button>
          `).join('')}
        </aside>
        <div class="glass-card flex flex-col lg:col-span-3 group-chat-panel">
          <div class="p-4 border-b border-white/5">
            <p class="font-bold text-white">${this.esc(g?.name || 'Group')}</p>
            <p class="text-[10px] text-gray-500">${g?.activeCount || 0} active now</p>
          </div>
          <div id="groupMsgBox" class="group-messages flex-1 overflow-y-auto p-4 space-y-3">
            ${this.groupMessages.map((m) => `
              <motion.div class="group-msg ${m.userId === this.user?.id ? 'group-msg--mine' : ''}">
                <p class="text-[10px] text-primary font-bold mb-1">${this.esc(m.userName)}</p>
                ${m.imageUrl ? `<img src="${m.imageUrl}" class="rounded-lg max-h-48 mb-1">` : ''}
                <p class="text-sm text-white">${this.esc(m.text)}</p>
                <p class="text-[9px] text-gray-500 mt-1">${new Date(m.createdAt).toLocaleTimeString()}</p>
              </div>
            `).join('')}
          </div>
          <div class="p-3 border-t border-white/5">
            ${this.pendingImagePreview ? `<img src="${this.pendingImagePreview}" class="rounded-lg max-h-24 mb-2">` : ''}
            <div class="flex gap-2 items-end">
              <label class="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 cursor-pointer text-primary">
                <i class="fas fa-image"></i>
                <input type="file" id="groupImage" accept="image/*" class="hidden">
              </label>
              <input id="groupMsgInput" class="input-field flex-1 py-2" placeholder="Type a message...">
              <button type="button" id="groupSendBtn" class="neon-btn px-4 py-2 text-xs shrink-0">Send</button>
            </div>
          </div>
        </div>
      </div>`.replaceAll('<motion.', '<').replaceAll('</motion.', '</');
  }

  render() {
    UserLayout.renderShell({ activeId: 'groups', title: 'Groups', bodyHtml: this.renderBody(), user: this.user });
    document.querySelectorAll('[data-gid]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this.activeGroup = btn.dataset.gid;
        await this.loadMessages();
        this.render();
      });
    });
    document.getElementById('groupSendBtn')?.addEventListener('click', () => this.sendMsg());
    document.getElementById('groupImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      this.pendingImagePreview = f ? await this.fileToDataUrl(f) : null;
      this.render();
    });
    const box = document.getElementById('groupMsgBox');
    if (box) box.scrollTop = box.scrollHeight;
  }

  async init() {
    this.user = await UserLayout.ensureAuth();
    if (!this.user) return;
    await this.loadGroups();
    await this.loadMessages();
    this.render();
  }
}
