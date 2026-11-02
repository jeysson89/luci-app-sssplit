'use strict';
'require view';
'require poll';
'require fs';
'require ui';
'require dom';

var CTL = '/usr/bin/sssplit-ctl';

function badge(ok, txt) {
	return E('span', { 'class': 'ifacebadge' + (ok ? '' : ' idle'), 'style': 'margin:2px 4px 2px 0' }, txt);
}
function bigBadge(ok, txt) {
	return E('span', { 'class': 'alert-message' + (ok ? ' success' : ' warning'), 'style': 'display:inline-block; padding:6px 12px; margin:4px 0' }, txt);
}
function row(label, cells) {
	return E('tr', { 'class': 'tr' }, [
		E('td', { 'style': 'width:38%' }, label),
		E('td', {}, cells)
	]);
}

var PROVIDERS = [
	['cloudflare', 'Cloudflare (по умолчанию)'],
	['google',     'Google'],
	['adguard',    'AdGuard DNS'],
	['comss',      'Comss.do (обход DPI, РФ)']
];

return view.extend({
	handleFix: function(ev, prov) {
		var self = this;
		return fs.exec(CTL, ['dns-fix', prov]).then(function(rc) {
			var out = String(rc.stdout || '');
			var hb = out.indexOf('heartbeat=ok') >= 0;
			ui.addNotification(null, E('p', {},
				(hb ? 'Провайдер DoH переключён и проверка пройдена ✔ (%h)'.format(prov)
				    : 'Провайдер %h применён, но heartbeat НЕ прошёл — DNS может быть недоступен, попробуйте другого провайдера!'.format(prov))),
				hb ? 'info' : 'warning');
			if (self.refresh) self.refresh();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	handleRefresh: function(ev) {
		if (this.refresh) this.refresh();
	},

	render: function() {
		var self = this;
		var frame = E([ E('h2', {}, 'DNS / DoH — мониторинг'),
			E('div', { 'class': 'cbi-map-descr' },
				'Состояние шифрования DNS. Все запросы клиентов должны идти через dnsmasq → https-dns-proxy (DoH/HTTPS, TLS). ' +
				'«Heartbeat» — реальный тест-запрос через локальный DNS. Если у вашего провайдера дросселируется DoH — переключите провайдера кнопками ниже.'),
			E('div', { 'id': 'sssplit-dns', 'class': 'cbi-map', 'style': 'margin-top:8px' }, '') ]);

		var doUpdate = function(res) {
			var node = document.getElementById('sssplit-dns');
			if (!node) return;
			var s = {};
			String(res.stdout || '').split('\n').forEach(function(l) {
				var i = l.indexOf('=');
				if (i > 0) s[l.slice(0, i)] = l.slice(i + 1);
			});
			self.draw(s);
		};

		poll.add(L.bind(function() {
			if (!document.getElementById('sssplit-dns')) return;
			fs.exec(CTL, ['dns-status']).then(doUpdate).catch(function(e) {
				var node = document.getElementById('sssplit-dns');
				if (node) dom.content(node, E('p', {}, 'Не удалось получить статус DNS: %s'.format(e.message)));
			});
		}, this), 6);

		self.refresh = function() {
			fs.exec(CTL, ['dns-status']).then(doUpdate).catch(function(e) {
				var node = document.getElementById('sssplit-dns');
				if (node) dom.content(node, E('p', {}, 'Не удалось получить статус DNS: %s'.format(e.message)));
			});
		};

		self.draw = function(s) {
			var node = document.getElementById('sssplit-dns');
			if (!node) return;
			var encrypted = (s.doh_installed === '1' && s.doh_process !== '0' && s.leak !== '1' && s.plain_upstreams === '0');
			var hb_ok = s.heartbeat === 'ok';
			var tbl = E('table', { 'class': 'table' });

			tbl.appendChild(row('Итог', [
				encrypted ? bigBadge(true, 'DNS ЗАШИФРОВАН (DoH)') : bigBadge(false, 'ОТКРЫТЫЙ DNS / PROBLEM'),
				E('div', { 'style': 'font-size:smaller' },
					encrypted ? 'Апстримы ходят по HTTPS/TLS' : 'Обнаружен незашифрованный DNS-канал — нажмите кнопку провайдера ниже')
			]));

			if (s.doh_installed !== '1') {
				tbl.appendChild(row('https-dns-proxy', badge(false, 'НЕ УСТАНОВЛЕН')));
			} else {
				tbl.appendChild(row('https-dns-proxy', s.doh_process !== '0' ? badge(true, 'работает (процессов: ' + s.doh_process + ')') : badge(false, 'НЕ ЗАПУЩЕН')));
				for (var i = 0; s['doh' + i + '_url']; i++) {
					tbl.appendChild(row('DoH №' + i, [
						badge(s['doh' + i + '_provider'] !== 'custom', (s['doh' + i + '_provider'] || '?')),
						E('div', { 'style': 'font-family:monospace; font-size:85%' }, s['doh' + i + '_url'] || ''),
						E('div', { 'style': 'font-size:smaller' }, 'bootstrap: ' + (s['doh' + i + '_bootstrap'] || '—'))
					]));
				}
			}

			tbl.appendChild(row('dnsmasq → DoH', [
				(s.dnsmasq_noresolv === '1' ? badge(true, 'noresolv+server→local DoH') : badge(false, 'falls back to WAN resolver')),
				E('div', { 'style': 'font-family:monospace; font-size:85%' }, (s.dnsmasq_server || '—'))
			]));
			tbl.appendChild(row('Незашифрованные апстримы', s.plain_upstreams === '0' ? badge(true, '0 (утечек нет)') : badge(false, s.plain_upstreams + ' — УТЕЧКА!')));
			tbl.appendChild(row('Перехват чужих DNS (force_dns)', s.force_dns === '1' ? badge(true, 'включён (53/853 → DoH)') : badge(false, 'выключен')));
			tbl.appendChild(row('Правила сплита (nftset)', s.sssplit_dns_rules === '1' ? badge(true, 'активны') : badge(false, 'отсутствуют')));
			tbl.appendChild(row('Heartbeat (тест через локальный DNS)', [
				hb_ok ? badge(true, 'ok (' + (s.heartbeat_s || '?') + ' c)' + (s.heartbeat_ip && s.heartbeat_ip !== 'Address:' ? ' → ' + String(s.heartbeat_ip).replace(/Address:\s*/, '') : '')) : badge(false, 'FAIL — DNS не отвечает')
			]));

			var grid = E('div', {}, [
				E('div', { 'class': 'cbi-map' }, tbl),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title', 'style': 'padding-top:4px' }, 'Сменить DoH-провайдера:'),
					E('div', { 'class': 'cbi-value-field' },
						PROVIDERS.map(function(p) {
							var active = (s.doh0_provider === p[0]);
							return E('button', {
								'class': 'cbi-button cbi-button-action' + (active ? '' : ' cbi-button-neutral'),
								'click': ui.createHandlerFn(self, 'handleFix', p[0]),
								'style': 'margin:4px 8px 4px 0'
							}, p[1]);
						}))
				]),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(self, 'handleRefresh') }, 'Проверить сейчас')
				])
			]);
			dom.content(node, grid);
		};

		return frame;
	}
});
