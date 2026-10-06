/* Project-local agent UI. Model output is text only; never render it as HTML. */
(() => {
    const node = (tag, text) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        return element;
    };
    const money = cents => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(cents) / 100);

    class ProjectAgent extends HTMLElement {
        connectedCallback() {
            if (this.initialized) return;
            this.initialized = true;
            this.projectId = Number(this.getAttribute('project-id'));
            if (!Number.isSafeInteger(this.projectId) || this.projectId < 1) return;
            const details = node('details');
            details.append(node('summary', 'GCSC AI · Project assistant'));
            this.log = node('div');
            this.access = node('div');
            this.log.setAttribute('role', 'log');
            this.log.setAttribute('aria-live', 'polite');
            this.log.style.cssText = 'max-height:450px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere';
            this.error = node('p');
            this.error.setAttribute('role', 'alert');
            const form = node('form');
            this.input = node('textarea');
            this.input.maxLength = 5000;
            this.input.required = true;
            this.input.setAttribute('aria-label', 'Message to project assistant');
            this.input.placeholder = 'Составь proposal / сравни предложения…';
            this.input.style.cssText = 'width:100%;min-height:70px;border:1px solid #cbd5e1;border-radius:8px;padding:8px';
            this.send = node('button', 'Отправить');
            this.send.type = 'submit';
            form.append(this.input, this.send);
            form.addEventListener('submit', async event => {
                event.preventDefault();
                if (!this.input.value.trim()) return;
                await this.work(async () => {
                    const result = await this.request('chat', { message: this.input.value });
                    this.input.value = '';
                    this.render(result);
                    await this.refresh();
                });
            });
            details.append(node('p', 'Личный чат этого проекта. Денежные и документные действия требуют подтверждения.'), this.access, this.log, this.error, form);
            details.style.cssText = 'margin-top:16px;padding:12px;border:1px solid #cbd5e1;border-radius:12px;background:white';
            details.addEventListener('toggle', () => {
                if (details.open && !this.loaded) this.work(async () => { await this.refresh(); this.loaded = true; });
            });
            this.append(details);
        }

        async request(path, body) {
            const token = localStorage.getItem('gcsc_token');
            if (!token) throw new Error('Войдите в аккаунт.');
            const base = typeof API_BASE === 'string' ? API_BASE : '';
            const response = await fetch(`${base}/api/agent/projects/${this.projectId}/${path}`, {
                method: body ? 'POST' : 'GET',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                ...(body && { body: JSON.stringify(body) }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Запрос не выполнен.');
            return data;
        }

        async work(callback) {
            if (this.busy) return;
            this.busy = true;
            this.error.textContent = '';
            const controls = [...this.querySelectorAll('button,textarea')];
            controls.forEach(control => { control.disabled = true; });
            this.setAttribute('aria-busy', 'true');
            try { await callback(); } catch (error) { this.error.textContent = error.message; }
            finally {
                controls.forEach(control => { if (control.isConnected) control.disabled = false; });
                this.busy = false;
                this.setAttribute('aria-busy', 'false');
            }
        }

        async refresh() {
            this.render(await this.request('chat'));
            const result = await this.request('documents');
            for (const doc of result.documents || []) {
                const card = node('section');
                card.append(node('strong', `Документ проекта: ${doc.kind} · ${doc.status}`), node('p', doc.payload.description || ''), node('p', doc.payload.consequence || ''));
                if (doc.payload.amountCents !== undefined) card.append(node('p', money(doc.payload.amountCents)));
                const details = node('details');
                details.append(node('summary', 'Полный документ'), node('pre', JSON.stringify(doc.payload, null, 2)));
                card.append(details);
                this.log.append(card);
            }
        }

        render(data) {
            this.log.replaceChildren();
            if (data.mode === 'homeowner' && !this.access.childNodes.length) {
                const invite = node('form');
                const id = node('input');
                id.type = 'number'; id.min = '1'; id.required = true;
                id.setAttribute('aria-label', 'ID подрядчика для доступа к этому проекту');
                id.placeholder = 'ID подрядчика';
                const button = node('button', 'Подтвердить доступ к проекту');
                button.type = 'submit';
                invite.append(node('p', 'Предоставьте выбранному подрядчику доступ к описанию проекта. Ваш личный чат останется приватным.'), id, button);
                invite.addEventListener('submit', event => {
                    event.preventDefault();
                    this.work(async () => {
                        await this.request('access', { contractorId: Number(id.value), confirmed: true });
                        this.error.textContent = 'Доступ предоставлен выбранному подрядчику.';
                    });
                });
                this.access.append(invite);
            }
            for (const message of data.messages || []) {
                if (message.role === 'user' || (message.role === 'assistant' && message.content)) {
                    this.log.append(node('p', `${message.role === 'user' ? 'Вы' : 'GCSC AI'}: ${message.content || ''}`));
                }
                if (message.role === 'assistant' && message.tool_calls) for (const call of message.tool_calls) {
                    this.log.append(node('p', `Действие агента: ${call.function.name}`));
                }
                if (message.role === 'tool') {
                    let result;
                    try { result = JSON.parse(message.content); } catch { result = { error: 'Invalid result' }; }
                    if (result.columns && result.rows) {
                        const wrap = node('div');
                        wrap.style.overflowX = 'auto';
                        const table = node('table');
                        const head = node('tr');
                        result.columns.forEach(column => head.append(node('th', column)));
                        table.append(head);
                        for (const row of result.rows) {
                            const tr = node('tr');
                            result.columns.forEach(column => tr.append(node('td', column === 'amount' ? money(row[column]) : String(row[column] ?? 'Не указано'))));
                            table.append(tr);
                        }
                        wrap.append(table);
                        this.log.append(wrap);
                    } else if (!result.requiresApproval && !result.action) {
                        const details = node('details');
                        details.append(node('summary', 'Результат инструмента'), node('pre', JSON.stringify(result, null, 2)));
                        this.log.append(details);
                    }
                }
            }
            for (const action of data.actions || []) {
                const card = node('section');
                card.style.cssText = 'border:1px solid #94a3b8;border-radius:8px;margin:10px 0;padding:10px';
                card.append(node('strong', `${action.action} · ${action.status}`));
                const payload = action.payload;
                card.append(node('p', payload.description || ''), node('p', payload.consequence || ''));
                if (payload.amountCents !== undefined) card.append(node('p', `Сумма: ${money(payload.amountCents)}`));
                if (payload.totalCents !== undefined) card.append(node('p', `Итого: ${money(payload.totalCents)}`));
                card.append(node('p', `Дата: ${payload.dueDate || 'Не указана'}; срок: ${payload.timelineDays ? payload.timelineDays + ' дней' : 'Не указан'}`));
                card.append(node('p', `Владелец: ${payload.homeownerId ?? '—'}; подрядчик: ${payload.contractorId ?? action.user_id}`));
                const full = node('details');
                full.append(node('summary', 'Полное описание действия'), node('pre', JSON.stringify(payload, null, 2)));
                card.append(full);
                if (action.status === 'pending' && Date.parse(action.expires_at) > Date.now()) {
                    for (const [decision, label] of [['approve', 'Подтвердить'], ['reject', 'Отклонить']]) {
                        const button = node('button', label);
                        button.type = 'button';
                        button.addEventListener('click', () => this.work(async () => {
                            await this.request(`actions/${action.id}/${decision}`, { confirmed: true });
                            await this.refresh();
                        }));
                        card.append(button);
                    }
                }
                if (action.result) card.append(node('pre', JSON.stringify(action.result, null, 2)));
                if (action.status === 'executing' || action.status === 'needs_review') card.append(node('p', 'Требуется проверка результата. Повторное исполнение заблокировано.'));
                this.log.append(card);
            }
        }
    }
    customElements.define('gcsc-project-agent', ProjectAgent);
})();
