'use strict';
'require view';
'require fs';
'require ui';
'require dom';

var CTL = '/usr/bin/sssplit-ctl';
var FILES = [
	[ 'proxy_domains.txt', 'Домены → через прокси' ],
	[ 'direct_domains.txt', 'Домены → всегда напрямую' ],
	[ 'proxy_ip.list', 'IP/подсети → через прокси' ],
	[ 'direct_ip.list', 'IP/подсети → всегда напрямую' ]
];

var ITDOG_BASE = 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main';
/* key, label, group; groups: dom_base, dom_svc, dom_cat, ip, ip_host */
var ITDOG_DEFAULT_ON = { domains:1, meta:1, cloudflare:1, cloudfront:1, twitter:1, discord:1, telegram:1 };
var SOURCES = [
	[ 'domains',      'Домены РФ: блокируемые (inside-raw.lst)',                 'dom_base' ],
	[ 'd_out',        'Домены РФ: исключения → напрямую (outside-raw.lst)',      'dom_base' ],
	[ 's_youtube',    'Незаблокированные домены YouTube',                        'dom_svc' ],
	[ 's_meta',       'Домены Meta (facebookcdn и др.)',                         'dom_svc' ],
	[ 's_twitter',    'Домены Twitter/X',                                        'dom_svc' ],
	[ 's_discord',    'Домены Discord',                                          'dom_svc' ],
	[ 's_telegram',   'Домены Telegram',                                         'dom_svc' ],
	[ 's_tiktok',     'Домены TikTok',                                           'dom_svc' ],
	[ 's_googleai',   'Домены Google AI (gemini и др.)',                         'dom_svc' ],
	[ 's_gplay',      'Домены Google Play',                                      'dom_svc' ],
	[ 's_gmeet',      'Домены Google Meet',                                      'dom_svc' ],
	[ 's_cloudflare', 'Домены Cloudflare',                                       'dom_svc' ],
	[ 's_cloudfront', 'Домены CloudFront',                                       'dom_svc' ],
	[ 's_hdrezka',    'Домены HDRezka',                                          'dom_svc' ],
	[ 'c_block',      'Категория: заблокированные соцсети/сервисы (block)',      'dom_cat' ],
	[ 'c_geoblock',   'Категория: геоблокировки',                                'dom_cat' ],
	[ 'c_news',       'Категория: новостные сайты',                              'dom_cat' ],
	[ 'c_anime',      'Категория: аниме',                                        'dom_cat' ],
	[ 'c_hodca',      'Категория: ставки/букмекеры',                             'dom_cat' ],
	[ 'c_porn',       'Категория: porn (-blocked)',                              'dom_cat' ],
	[ 'meta',         'IP: Meta — Facebook, Instagram, WhatsApp (meta.lst)',     'ip' ],
	[ 'cloudflare',   'IP: Cloudflare (cloudflare.lst)',                         'ip' ],
	[ 'cloudfront',   'IP: CloudFront / AWS (cloudfront.lst)',                   'ip' ],
	[ 'twitter',      'IP: Twitter/X (twitter.lst)',                             'ip' ],
	[ 'discord',      'IP: Discord (discord.lst)',                               'ip' ],
	[ 'telegram',     'IP: Telegram (telegram.lst)',                             'ip' ],
	[ 'ip_digitalocean','IP: DigitalOcean (digitalocean.lst)',        'ip_host' ],
	[ 'ip_hetzner',   'IP: Hetzner',                                             'ip_host' ],
	[ 'ip_ovh',       'IP: OVH',                                                 'ip_host' ],
	[ 'ip_roblox',    'IP: Roblox',                                              'ip_host' ],
	[ 'ip_gmeet',     'IP: Google Meet',                                         'ip_host' ]
];
var ITDOG_GROUPS = [
	[ 'dom_base', 'Домены — основа (Россия)' ],
	[ 'dom_svc',  'Домены — сервисы' ],
	[ 'dom_cat',  'Домены — категории' ],
	[ 'ip',       'IP-подсети сервисов (IPv4)' ],
	[ 'ip_host',  'IP-подсети хостеров (IPv4)' ]
];

return view.extend({
	load: function() {
		return Promise.all([
			Promise.all(FILES.map(function(f){
				return fs.read('/etc/sssplit/' + f[0]).then(function(c){ return c.content || ''; }).catch(function(){ return ''; });
			})),
			fs.exec(CTL, ['status']).then(function(rc){ return String(rc.stdout || ''); }).catch(function(){ return ''; })
		]);
	},

	handleSave: function(ev) {
		var self = this;
		var tasks = FILES.map(function(f, i){
			var ta = document.getElementById('ta-' + f[0]);
			return fs.write('/etc/sssplit/' + f[0], ta.value.replace(/\r\n/g, '\n'));
		});
		Promise.all(tasks).then(function(){
			return fs.exec(CTL, ['apply']);
		}).then(function(rc){
			ui.addNotification(null, E('p', {}, 'Списки сохранены и применены: ' + String(rc.stdout||'').trim()), 'info');
		}).catch(function(e){
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	handleSync: function(ev) {
		ui.showModal(E('div', { 'class': 'spinning' }, 'Загружаю актуальные списки из активированных источников itdog (podkop)…'));
		fs.exec(CTL, ['update-lists']).then(function(rc){
			ui.hideModal();
			var out = String(rc.stdout || '').trim();
			var ok = out.indexOf('all_sources_failed') < 0 && out.indexOf('domains_added') >= 0;
			ui.addNotification(null, E('p', {}, (ok ? 'Списки обновлены: ' : 'Загрузка не удалась: ') + out.replace(/\n/g, ' · ')),
				ok ? 'info' : 'warning');
			window.location.reload();
		}).catch(function(e){
			ui.hideModal();
			ui.addNotification(null, E('p', {}, 'Ошибка загрузки: %s'.format(e.message)));
		});
	},

	/* checkbox for an itdog source: persist immediately; on activation download from repo */
	handleSource: function(ev) {
		var self = this;
		var key = ev.target.getAttribute('data-key');
		var on = ev.target.checked;
		fs.exec(CTL, ['itdog-src', key, on ? '1' : '0']).then(function(){
			if (on) {
				ui.showModal(E('div', { 'class': 'spinning' }, 'Источник активирован — загружаю с репозитория itdog…'));
				fs.exec(CTL, ['update-lists']).then(function(rc){
					ui.hideModal();
					var out = String(rc.stdout || '').trim();
					ui.addNotification(null, E('p', {}, 'Списки загружены: ' + out.replace(/\n/g, ' · ')), 'info');
					window.location.reload();
				}).catch(function(e){
					ui.hideModal();
					ui.addNotification(null, E('p', {}, 'Ошибка загрузки: %s'.format(e.message)));
				});
			} else {
				ui.addNotification(null, E('p', {}, 'Источник отключён. Уже скачанные записи остаются в списке — они будут перезаписаны при следующей загрузке.'), 'info');
			}
		}).catch(function(e){
			ev.target.checked = !on;
			ui.addNotification(null, E('p', {}, 'Ошибка: %s'.format(e.message)));
		});
	},

	render: function(data) {
		var self = this;
		var fileContents = data[0];
		var src = {};
		String(data[1] || '').split('\n').forEach(function(l){
			var m = l.match(/^itdog_src_(\w+)=(.*)$/);
			if (m) src[m[1]] = String(m[2]).trim();
		});

		var grid = E('div', {});
		FILES.forEach(function(f, i){
			grid.appendChild(E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'padding-top:0' }, f[1]),
				E('div', { 'class': 'cbi-value-field' },
					E('textarea', { 'id': 'ta-' + f[0], 'style': 'width:100%; min-height:%dpx'.format(i===0?160:90), 'spellcheck': 'false' }, fileContents[i])
				)
			]));
		});

		/* itdog sources: grouped catalog; checkbox = activate & download */
		var srcBox = E('div', { 'style': 'margin:6px 0' });
		ITDOG_GROUPS.forEach(function(g){
			var rows = SOURCES.filter(function(sc){ return sc[2] === g[0]; });
			if (!rows.length) return;
			srcBox.appendChild(E('div', { 'style': 'font-weight:bold;margin:8px 0 2px;color:#555' }, g[1]));
			rows.forEach(function(sc){
				var key = sc[0];
				var v = (src[key] || '').trim();
				var on = v === '1' || (v !== '0' && !!ITDOG_DEFAULT_ON[key]);
				srcBox.appendChild(E('div', { 'style': 'margin:3px 0 3px 12px' }, [
					E('label', { 'style': 'cursor:pointer' }, [
						E('input', { 'type': 'checkbox', 'data-key': key, 'checked': on ? 'checked' : null,
							'click': ui.createHandlerFn(self, 'handleSource'), 'style': 'margin-right:8px; vertical-align:middle' }),
						sc[1]
					])
				]));
			});
		});
		grid.appendChild(E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'style': 'padding-top:0' }, 'Списки itdog (podkop): какие источники подтягивать'),
			E('div', { 'class': 'cbi-value-field' }, [
				E('div', { 'class': 'cbi-map-descr', 'style': 'margin:2px 0 6px' },
					'Каталог источников репозитория itdoginfo/allow-domains (тот же, что у podkop/forkop). Домен-источники дописываются в «Домены → через прокси», «исключения» — в «Домены → всегда напрямую», подсети — в «IP → через прокси». ' +
					'□ Включение галочки сразу скачивает источник и дописывает записи в конец вашего списка (ручные сверху сохраняются, дубли удаляются). ' +
					'Выключение перестаёт догружать источник; уже скачанное остаётся в списке, пока вы не уберёте записи вручную (но при следующей синке блок перезаписывается только из активных источников).'),
				srcBox,
				E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(self, 'handleSync'), 'style': 'margin-top:6px' },
					'Перезагрузить все активированные списки')
			])
		]));

		grid.appendChild(E('div', { 'class': 'cbi-page-actions' }, [
			E('button', { 'class': 'cbi-button cbi-button-save', 'click': ui.createHandlerFn(this, 'handleSave') }, 'Сохранить и применить')
		]));
		return E([ E('h2', {}, 'Списки доменов и IP-адресов'),
			E('div', { 'class': 'cbi-map-descr' },
				'Один домен или IP/подсеть на строку (# — комментарий). Домены без «www» — правило действует и на поддомены. ' +
				'Свои IP/домены — вводите прямо в окнах ниже; свежие списки блокировок можно периодически подтягивать из репозитория itdog (тот же источник, которым пользуется podkop/forkop). Изменения вступают в силу после «Сохранить и применить» или кнопки загрузки.'),
			grid ]);
	}
});
