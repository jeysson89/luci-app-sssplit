'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require form';

var CTL = '/usr/bin/sssplit-ctl';

return view.extend({
	load: function() {
		return uci.load('sssplit');
	},

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return fs.exec(CTL, ['apply']);
		}).catch(function(e){
			ui.addNotification(null, E('p', {}, 'Ошибка применения: %s'.format(e.message)));
		});
	},

	handleInstallRust: function(ev) {
		return fs.exec(CTL, ['install-rust']).then(function(rc){
			var out = String(rc.stdout||'').trim();
			ui.addNotification(null, E('p', {}, out === 'rust_ready' ?
				'Движок rust готов (бинарник в /tmp/sslocal)' : 'Не удалось загрузить/распаковать движок rust — проверьте URL и доступ в интернет'));
		});
	},

	render: function() {
		var m, s, o;
		m = new form.Map('sssplit', 'Настройки SS Split', null);

		s = m.section(form.NamedSection, 'global', 'global', 'Общие');
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', 'Включить раздельную маршрутизацию');
		o.default = o.disabled;

		o = s.option(form.ListValue, 'mode', 'Режим маршрутизации');
		o.value('by_list', 'По спискам (домены/IP из списков — через прокси, остальное напрямую)');
		o.value('proxy_all', 'Всё через прокси (напрямую — только списки и приватные сети)');
		o.default = 'by_list';

		o = s.option(form.ListValue, 'engine', 'Движок');
		o.value('ssr', 'ssr-libev (классический SS/SSR, stream-шифры, хранится в flash)');
		o.value('rust', 'shadowsocks-rust sslocal (AEAD/ss-2022, хранится в RAM)');
		o.default = 'ssr';

		o = s.option(form.ListValue, 'pick', 'Выбор сервера', 'В режиме «Автовыбор» тестируются только серверы с флажком «Вкл» на вкладке «Серверы», у лучшего выбор запоминается отдельно (флажки не перезаписываются). В режиме «Вручную» работает отмеченный сервер.');
		o.value('manual', 'Вручную (сервер с флажком «Вкл»)');
		o.value('auto', 'Автовыбор (лучший по пингу из отмеченных)');
		o.default = 'manual';

		o = s.option(form.ListValue, 'pick_interval', 'Фоновая автопроверка', 'Как часто заново пинговать серверы и при необходимости переключаться на более быстрый. 0 — проверять только при «Применить» / кнопке «Автовыбор».');
		o.value('0', '0 — только вручную');
		o.value('60', 'Каждые 60 секунд');
		o.value('120', 'Каждые 2 минуты');
		o.value('300', 'Каждые 5 минут');
		o.value('600', 'Каждые 10 минут');
		o.value('1800', 'Каждые 30 минут');
		o.value('3600', 'Каждый час');
		o.depends('pick', 'auto');
		o.default = '60';

		o = s.option(form.Value, 'probe_to', 'Тайм-аут проверки сервера', 'Сколько секунд ждать ответа при пинге (TCP connect) одного сервера. Меньше — быстрее проверка, но сухо отсекаются медленные серверы.');
		o.datatype = 'range(1,10)';
		o.default = '3';
		o.depends('pick', 'auto');

		o = s.option(form.Value, 'tcp_port', 'Локальный порт redirect (TCP и UDP tproxy)');
		o.datatype = 'port';
		o.default = '1080';

		o = s.option(form.Flag, 'udp_relay', 'Проксировать UDP (TPROXY)');
		o.default = o.disabled;

		o = s.option(form.Flag, 'ipv6', 'IPv6-маршрутизация');
		o.default = o.disabled;

		o = s.option(form.Value, 'rust_url', 'URL пакета движка rust');
		o.rmempty = true;

		o = s.option(form.Value, 'list_domains_url', 'Список доменов из itdog (podkop)', 'URL-ы (через пробел) списков доменов для скачивания кнопкой «Обновить из itdog» на вкладке «Списки». По умолчанию — allow-domains/Russia/inside-raw.lst (podkop, актуальные блокировки). raw.githubusercontent.com при блокировке автоматически заменяется на jsDelivr.');
		o.placeholder = 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Russia/inside-raw.lst';
		o.rmempty = true;

		o = s.option(form.Value, 'list_ip_url', 'Списки IP/подсетей из itdog', 'Несколько URL через пробел — они будут объединены и очищены от дублей. По умолчанию: Meta, Cloudflare, Cloudfront, Twitter, Discord, Telegram из allow-domains/Subnets.');
		o.placeholder = 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Subnets/IPv4/meta.lst …';
		o.rmempty = true;

		o = s.option(form.Button, '_rust', 'Установить/обновить движок rust');
		o.inputstyle = 'apply';
		o.onclick = this.handleInstallRust;

		return m.render();
	}
});
