'use strict';
'require view';
'require poll';
'require fs';
'require uci';
'require ui';
'require dom';

var CTL = '/usr/bin/sssplit-ctl';
var GRAPH_W = 620, GRAPH_H = 130, MAX_PTS = 90;

function badge(ok, txt) {
	return E('span', { 'class': 'ifacebadge' + (ok ? '' : ' idle'), 'style': 'margin:2px 4px 2px 0; font-size:120%' }, txt);
}

function svcBadge(on, txt) {
	return E('span', { 'class': 'ifacebadge' + (on ? '' : ' idle'), 'style': 'margin:2px 4px 2px 0; opacity:' + (on ? '1' : '.55') }, (on ? '● ' : '○ ') + txt);
}

function fmtBps(b) {
	if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB/s';
	if (b >= 1024) return (b / 1024).toFixed(1) + ' KB/s';
	return Math.round(b) + ' B/s';
}

function fmtBytes(b) {
	if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
	if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
	if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
	return Math.round(b) + ' B';
}

/* nft prints big byte counters with K/M/G suffixes sometimes */
function parseCount(v) {
	v = String(v == null ? '' : v).trim();
	var m = v.match(/^([\d.]+)\s*([KMGT]?)/);
	if (!m) return 0;
	var n = parseFloat(m[1]) || 0;
	if (m[2] === 'K') n *= 1024;
	else if (m[2] === 'M') n *= 1048576;
	else if (m[2] === 'G') n *= 1073741824;
	else if (m[2] === 'T') n *= 1099511627776;
	return n;
}

function drawGraph(canvas, pts) {
	/* pts: array of bytes/s ; render as SVG polyline */
	var node = canvas;
	var max = 1024;
	for (var i = 0; i < pts.length; i++) if (pts[i] > max) max = pts[i];
	max = max * 1.15;
	var w = node.clientWidth || 600;
	var h = node.clientHeight || GRAPH_H;
	var innerW = w - 52, innerH = h - 22;
	var svg = [];
	svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" style="display:block;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px">'.format(w, h));
	/* grid */
	svg.push('<line x1="44" y1="%d" x2="%d" y2="%d" stroke="#ccc" stroke-width="1"/>'.format(innerH + 10, 44 + innerW, innerH + 10));
	svg.push('<text x="2" y="%d" font-size="10" fill="#555">%s</text>'.format(14, fmtBps(max)));
	svg.push('<text x="2" y="%d" font-size="10" fill="#555">0</text>'.format(innerH + 14));
	for (var j = 0; j < pts.length; j++) {
		var x = 44 + (pts.length <= 1 ? innerW : (j / (pts.length - 1)) * innerW);
		var y = 10 + innerH - (pts[j] / max) * innerH;
		if (j === 0) svg.push('<polyline points="');
		svg.push('%d,%d '.format(x, y));
	}
	svg.push('" fill="none" stroke="#2c6edd" stroke-width="1.6"/>');
	/* fill area */
	if (pts.length > 1) {
		var p = [];
		for (var k = 0; k < pts.length; k++) {
			var xx = 44 + (k / (pts.length - 1)) * innerW;
			var yy = 10 + innerH - (pts[k] / max) * innerH;
			p.push('%d,%d'.format(xx, yy));
		}
		svg.push('<polygon points="44,%d %s %d,%d" fill="rgba(44,110,221,.12)"/>'.format(10 + innerH, p.join(' '), 44 + innerW, 10 + innerH));
	}
	svg.push('</svg>');
	node.innerHTML = svg.join('');
}

function card(title, body) {
	var parts = (body instanceof Array) ? body : [ body ];
	parts = parts.filter(function(p){ return p !== null && p !== undefined; });
	return E('div', { 'class': 'tr tile', 'style': 'display:inline-block;vertical-align:top;background:#fff;border:1px solid #e6e6e6;border-radius:8px;padding:10px 14px;margin:4px 8px 4px 0;min-width:220px' }, [
		E('div', { 'style': 'color:#888;font-size:85%;margin-bottom:4px' }, title),
		E('div', {}, parts)
	]);
}

return view.extend({
	load: function() {
		return uci.load('sssplit');
	},

	handleRestart: function(ev) {
		return fs.exec(CTL, ['apply']).then(function(){
			ui.addNotification(null, E('p', {}, 'Применено'), 'info');
		}).catch(function(e){
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	handleStop: function(ev) {
		return fs.exec(CTL, ['stop']).then(function(){
			ui.addNotification(null, E('p', {}, 'Служба остановлена (раздельная маршрутизация выключена)'), 'info');
		}).catch(function(e){
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	/* traffic samples live in the view instance */
	samples: [],
	lastBytes: null,

	render: function() {
		var self = this;
		var frame = E('div', { 'class': 'cbi-map' }, E('div', { 'id': 'sssplit-status', 'class': '' }, ''));

		poll.add(L.bind(function() {
			var node = document.getElementById('sssplit-status');
			if (!node) return;
			fs.exec(CTL, ['status']).then(function(res) {
				var s = {};
				String(res.stdout || '').split('\n').forEach(function(l){
					var i = l.indexOf('=');
					if (i > 0) s[l.slice(0,i)] = l.slice(i+1);
				});
				self.draw(node, s);
			}).catch(function(e){
				dom.content(node, E('p', {}, 'Не удалось получить статус: %s'.format(e.message)));
			});
		}, this), 2);

		return frame;
	},

	draw: function(node, s) {
		var self = this;
		var running = s.running === '1' && s.enabled === '1';
		var state, stateCls;
		if (running) { state = 'РАБОТАЕТ'; stateCls = 'ifacebadge'; }
		else if (s.enabled === '1') { state = 'ОШИБКА — движок не запущен'; stateCls = 'ifacebadge rotflash'; }
		else { state = 'ВЫКЛЮЧЕНО'; stateCls = 'ifacebadge idle'; }

		/* which server is running: match host:port to the configured list */
		var srvName = '';
		if (s.server_enabled === '1') {
			uci.sections('sssplit', 'server').forEach(function(sec){
				if (sec.host === (s.server || '').split(':')[0] && String(sec.port) === (s.server || '').split(':')[1])
					srvName = sec.name || '';
			});
		}

		var svcs = E('div', { 'style': 'margin-top:6px' }, [
			svcBadge(s.proc_sslocal !== '0', 'sslocal (shadowsocks-rust)'),
			svcBadge(s.proc_ssr !== '0', 'ssr-libev'),
			svcBadge(s.proc_ipt2socks !== '0', 'ipt2socks (redirect)'),
			svcBadge(s.proc_doh !== '0', 'https-dns-proxy (DoH × ' + (s.proc_doh || '0') + ')'),
			svcBadge(s.proc_monitor === '1', 'фон. монитор (каждые %s с)'.format(s.monitor_interval || '?'))
		]);

		/* traffic accounting: nft counter bytes → delta per second */
		var tot = parseCount(s.redirect_bytes);
		if (self.lastBytes !== null && self.lastBytes !== undefined) {
			var d = tot - self.lastBytes;
			if (d >= 0) {
				var rate = d / 2; /* poll every 2 s */
				self.samples.push(rate);
				if (self.samples.length > MAX_PTS) self.samples.shift();
			}
		}
		self.lastBytes = tot;

		var head = E('div', { 'style': 'margin-bottom:8px' }, [
			card('Состояние', [badge(running, state), running ? E('span', { 'style': 'color:#888;font-size:85%' }, '  pid ' + (s.pid || '?')) : null]),
			card('Текущий сервер', s.server_enabled === '1'
				? [E('b', {}, s.server), E('div', { 'style': 'font-size:85%;color:#555' }, '%s · %s'.format(srvName || 'без имени', s.server_method || ''))]
				: E('span', { 'style': 'color:#888' }, 'не задан')),
			card('Движок / режим', [
				E('b', {}, s.engine === 'rust' ? 'shadowsocks-rust (sslocal)' : 'ssr-libev'),
				E('div', { 'style': 'font-size:85%;color:#555' }, s.mode === 'proxy_all' ? 'всё через прокси' : 'по спискам (by_list)')
			]),
			card('Порты', [
				E('b', {}, 'TCP ' + (s.tcp_port || '1080')),
				E('div', { 'style': 'font-size:85%;color:#555' }, s.udp_relay === '1' ? 'UDP tproxy: ' + (s.udp_port || '1090') : 'UDP выключен')
			])
		]);

		var graphRow = E('div', { 'style': 'margin:10px 0' }, [
			E('h3', { 'style': 'margin-bottom:2px' }, 'Трафик через прокси'),
			E('div', { 'style': 'color:#888;font-size:85%;margin-bottom:4px' }, [
				'Сейчас: ', E('b', {}, self.samples.length ? fmtBps(self.samples[self.samples.length-1]) : '…'),
				' · всего за сессию(nft): ', E('b', {}, fmtBytes(tot)),
				' · пакеты: ', E('b', {}, s.redirect_packets || '0')
			]),
			E('div', { 'id': 'sssplit-graph', 'style': 'width:100%;max-width:%dpx;height:%dpx'.format(GRAPH_W + 20, GRAPH_H) }, '')
		]);

		var detail = E('table', { 'class': 'table', 'style': 'margin-top:10px' }, [
			E('tr', {}, [E('td', { 'style': 'width:30%' }, 'Наборы IP (nft)'), E('td', {}, 'proxy: %s, direct: %s'.format(s.set_proxy_v4 || '0', s.set_direct_v4 || '0'))]),
			E('tr', {}, [E('td', { 'style': 'width:30%' }, 'Списки'), E('td', {}, 'домены→прокси: %s, домены→напрямую: %s, ip→прокси: %s, ip→напрямую: %s'.format(
				s.list_proxy_domains || '0', s.list_direct_domains || '0', s.list_proxy_ip || '0', s.list_direct_ip || '0'))])
		]);

		dom.content(node, [
			E('div', { 'class': 'cbi-map-descr', 'style': 'margin-bottom:6px' }, svcs),
			head,
			graphRow,
			detail,
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(self, 'handleRestart') }, 'Перезапустить / Применить'),
				E('button', { 'class': 'cbi-button cbi-button-remove', 'click': ui.createHandlerFn(self, 'handleStop'), 'style': 'margin-left:6px' }, 'Остановить')
			])
		]);

		var g = document.getElementById('sssplit-graph');
		if (g) drawGraph(g, self.samples);
	}
});
