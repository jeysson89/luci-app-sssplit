'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require form';
'require dom';

var CTL = '/usr/bin/sssplit-ctl';

return view.extend({
	load: function() {
		return uci.load('sssplit');
	},

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return fs.exec(CTL, ['apply']).then(function(rc) {
				var out = String(rc.stdout || '').trim();
				if (out.indexOf('started') >= 0)
					ui.addNotification(null, E('p', {}, 'Сохранено и применено — прокси запущен'), 'info');
				else
					ui.addNotification(null, E('p', {}, 'Сохранено. Применение: ' + (out || '…')));
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, 'Ошибка применения: %s'.format(e.message)));
			});
		});
	},

	handleImport: function(ev) {
		var uri = String(document.getElementById('ss-uri').value || '').trim();
		if (!uri) { ui.addNotification(null, E('p', {}, 'Вставьте ссылку ss://')); return; }
		fs.exec(CTL, ['add-uri', uri]).then(function(rc) {
			var out = String(rc.stdout || '');
			if (out.indexOf('added=') < 0) {
				ui.addNotification(null, E('p', {}, 'Не удалось добавить ссылку: %s'.format(out.trim() || 'формат не распознан')));
				return;
			}
			var rust = out.indexOf('engine=rust') >= 0;
			ui.addNotification(null, E('p', {}, 'Сервер добавлен: %s'.format(out.replace(/\n/g, ' '))), 'info');
			if (rust && out.indexOf('hint=') >= 0)
				ui.addNotification(null, E('p', {}, 'Движок set=rust: бинарник sslocal ещё не загружен — откройте «Настройки» и нажмите «Установить/обновить движок rust»'));
			uci.unload('sssplit');
			uci.load('sssplit').then(function() { window.location.reload(); });
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	handlePing: function(ev) {
		var out = document.getElementById('ss-ping');
		dom.content(out, E('div', { 'class': 'spinning' }, 'Проверка доступности серверов …'));
		fs.exec(CTL, ['check']).then(function(rc) {
			var lines = String(rc.stdout || '').split('\n').filter(function(l) { return l.indexOf('=') > 0; });
			var byId = {};
			lines.forEach(function(l) {
				var m = l.match(/^(srv\d+)_(\w+)=(.*)$/);
				if (!m) return;
				byId[m[1]] = byId[m[1]] || {};
				byId[m[1]][m[2]] = m[3];
			});
			var tbl = E('table', { 'class': 'table', 'style': 'max-width:600px' });
			Object.keys(byId).forEach(function(k) {
				var s = byId[k];
				tbl.appendChild(E('tr', {}, [
					E('td', {}, s.up === '1' ? '✔' : '✖'),
					E('td', {}, s.name || k),
					E('td', { 'style': 'font-family:monospace' }, s.target || ''),
					E('td', {}, s.method || ''),
					E('td', {}, s.up === '1' ? (s.latency + ' c') : 'недоступен')
				]));
			});
			dom.content(out, Object.keys(byId).length ? tbl : 'Серверов нет');
			// refresh status column in the grid (do_check persisted latency/last_ok)
			uci.unload('sssplit');
			uci.load('sssplit').then(function() { window.location.reload(); });
		}).catch(function(e) {
			dom.content(out, 'Ошибка: %s'.format(e.message));
		});
	},

	handleAutoPick: function(ev) {
		fs.exec(CTL, ['pick-auto']).then(function(rc) {
			var out = String(rc.stdout || '');
			if (out.indexOf('picked=none') >= 0)
				ui.addNotification(null, E('p', {}, 'Автовыбор: ни один сервер не отвечает!'));
			else
				ui.addNotification(null, E('p', {}, 'Выбран лучший сервер: %s'.format(out.replace(/\n/g, ' ').trim())), 'info');
			uci.unload('sssplit');
			uci.load('sssplit').then(function() { window.location.reload(); });
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	handleSetAll: function(ev) {
		var on = ev.target.getAttribute('data-on') === '1';
		fs.exec(CTL, ['enable-servers', on ? '1' : '0']).then(function(rc) {
			ui.addNotification(null, E('p', {}, String(rc.stdout || '').replace(/\n/g, ' ').trim()), 'info');
			uci.unload('sssplit');
			uci.load('sssplit').then(function() { window.location.reload(); });
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	render: function() {
		var m, s, o;
		var self = this;

		m = new form.Map('sssplit', 'Shadowsocks-серверы',
			'Флажок «Вкл» задаёт пул серверов: в режиме «Автовыбор» тестируются только отмеченные серверы и выбирается самый быстрый доступный (выбор запоминается отдельно, флажки не меняются); в режиме «Вручную» работает отмеченный сервер. ' +
			'Шифры AEAD (aes-256-gcm, chacha20-ietf-poly1305, 2022-*) работают ТОЛЬКО в движке rust. Полные настройки (пароль, SSR-плагины) — в окне редактирования.');

		var panel = E('div', { 'style': 'margin-bottom:12px' }, [
			E('h3', {}, 'Быстрые действия'),
			E('div', { 'style': 'margin:6px 0' }, [
				E('span', { 'style': 'margin-right:6px' }, 'Ссылка ss://'),
				E('input', { 'id': 'ss-uri', 'type': 'text', 'class': 'cbi-input-text', 'style': 'width:70%', 'placeholder': 'ss://base64(method:password)@host:port#Имя' }),
				E('button', { 'class': 'cbi-button cbi-button-add', 'click': ui.createHandlerFn(self, 'handleImport'), 'style': 'margin-left:6px' }, 'Добавить сервер из ss://')
			]),
			E('div', { 'style': 'margin:6px 0' }, [
				E('button', { 'class': 'cbi-button', 'click': ui.createHandlerFn(self, 'handleSetAll'), 'data-on': '1', 'style': 'margin-right:6px' }, 'Вкл все'),
				E('button', { 'class': 'cbi-button', 'click': ui.createHandlerFn(self, 'handleSetAll'), 'data-on': '0', 'style': 'margin-right:6px' }, 'Выкл все'),
				E('button', { 'class': 'cbi-button', 'click': ui.createHandlerFn(self, 'handlePing'), 'style': 'margin-right:6px' }, 'Проверить все (ping)'),
				E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(self, 'handleAutoPick') }, 'Автовыбор лучшего сервера')
			]),
			E('div', { 'id': 'ss-ping', 'style': 'margin-top:6px' }, '')
		]);

		s = m.section(form.GridSection, 'server', 'Серверы');
		s.addremove = true;
		s.anonymous = false;
		s.sortable = true;
		s.sectiontitle = function(sid) { return uci.get('sssplit', sid, 'name') || 'Без имени'; };

		o = s.option(form.Value, 'name', 'Название');
		o.placeholder = 'Мой SS-сервер';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'host', 'Адрес сервера');
		o.datatype = 'host';
		o.rmempty = false;
		o.width = '26%';

		o = s.option(form.Value, 'port', 'Порт');
		o.datatype = 'port';
		o.default = '8388';
		o.rmempty = false;
		o.width = '8%';

		o = s.option(form.ListValue, 'method', 'Шифрование');
		o.value('rc4-md5'); o.value('aes-128-cfb'); o.value('aes-192-cfb'); o.value('aes-256-cfb');
		o.value('chacha20'); o.value('chacha20-ietf');
		o.value('aes-128-gcm'); o.value('aes-256-gcm'); o.value('chacha20-ietf-poly1305');
		o.value('2022-blake3-aes-128-gcm'); o.value('2022-blake3-aes-256-gcm'); o.value('2022-blake3-chacha20-poly1305');
		o.default = 'rc4-md5';
		o.width = '24%';

		o = s.option(form.Value, 'password', 'Пароль');
		o.password = true;
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.ListValue, 'protocol', 'SSR-протокол (плагин)', 'Для чистого Shadowsocks оставьте origin.');
		o.value('origin'); o.value('auth_aes128_md5'); o.value('auth_aes128_sha1');
		o.value('auth_aes128_md5_v4'); o.value('auth_aes128_sha1_v4');
		o.default = 'origin';
		o.modalonly = true;

		o = s.option(form.ListValue, 'obfs', 'Обфускация', 'Для чистого Shadowsocks оставьте plain.');
		o.value('plain'); o.value('http'); o.value('tls');
		o.default = 'plain';
		o.modalonly = true;

		o = s.option(form.Value, 'protocol_param', 'protocol_param');
		o.rmempty = true;
		o.modalonly = true;

		o = s.option(form.Value, 'obfs_param', 'obfs_param');
		o.rmempty = true;
		o.modalonly = true;

		o = s.option(form.DummyValue, 'stat', 'Статус / пинг');
		o.width = '14%';

		o = s.option(form.Flag, 'enabled', 'Вкл');
		o.default = o.disabled;
		o.editable = true;
		o.width = '6%';

		return m.render().then(function(mnode) {
			mnode.insertBefore(panel, mnode.firstChild);
			return mnode;
		});
	}
});
