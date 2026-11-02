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
			return fs.exec(CTL, ['apply']).catch(function(e){
				ui.addNotification(null, E('p', {}, 'Ошибка применения: %s'.format(e.message)));
			});
		});
	},

	render: function() {
		var m, s, o;
		m = new form.Map('sssplit', 'Клиенты (устройства в сети)',
			'Раздельная маршрутизация по устройствам: устройство с политикой «прокси» отправляет ВЕСЬ свой трафик через Shadowsocks (вне списков), ' +
			'«напрямую» — наоборот, полностью игнорирует прокси. Остальные следуют правилам списков.');

		s = m.section(form.GridSection, 'hostrule', 'Правила для устройств');
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;

		o = s.option(form.Value, 'name', 'Название');
		o.placeholder = 'Ноутбук';
		o.rmempty = false;

		o = s.option(form.Value, 'ip', 'IP-адрес');
		o.datatype = 'or(ip4addr,ip6addr)';
		o.rmempty = false;

		o = s.option(form.ListValue, 'policy', 'Политика');
		o.value('proxy', 'Прокси (весь трафик)');
		o.value('direct', 'Напрямую (мимо прокси)');
		o.default = 'proxy';
		o.rmempty = false;

		return m.render();
	}
});
