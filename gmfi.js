var uid = getCookie("uid");
var sid = getCookie("sid");
var login = getCookie("login");
var api_host = getCookie("api_host");


if (! api_host)
	api_host = "https://d3.ru";

var api_path = {
	login: "/api/auth/login/",
	posts: "/api/users/%s/posts/",
	favourites: "/api/users/%s/favourites/posts/",
	comments: "/api/users/%s/comments/"
};


var abortAll = false;

var $loginForm;
var $controlForm;
var $infoPanel;
var $imgPanel;

$(function () {

	$loginForm = $('#loginform');
	$('button:submit', $loginForm).click(function () {
		api_host = $(this).val();
	});

	$loginForm.on('submit', function (e) {
		e.preventDefault();
		logIn($(this));
		return false;
	});

	if (!uid || !sid) {
		showLogin();
	}
	else {
		showContent();
	}


	$(document).on('loginSuccess', function () {
		$loginForm.get(0).reset();
		showContent();

	});
	$(document).on('loginError', function (e, msg) {
		alert(msg);
	});
	$(document).on('logOut', function () {
		showLogin();
	});
	$(document).on("click", '#logoutLink', logOut);
	$(document).on("click", '#clearStorage', clearStorage);
	$(document).on("click", '#searchBtn', searchImages);
	$(document).on("click", '#abortBtn', function () {
		abortAll = true;
	});

});


function showLogin() {
	$('.content_wrapper').hide();
	$('.login_wrapper').show();
	$controlForm = $infoPanel = $imgPanel = null;
}

function showContent() {
	$('.login_wrapper').hide();
	$('#upanel').html("<dl id='userData'><dt>Logged in as: </dt>" +
		"<dd>" + login + "</dd>,<dt>ID:</dt><dd>" +
		uid + '</dd></dl>' +
		'<div class="topLinks">' +
		'<span id="clearStorage">Clear Storage</span>' +
			'<span id="logoutLink">Logout</span>' +
		'</div>'
		);
	$controlForm = $('#controlform');
	$infoPanel = $('.ipanel').html('');
	$imgPanel = $('#imgPane').find('.masonry').html('');
	$('input[name="username"]', $controlForm).val(login);
	$('.content_wrapper').show();
}

function logIn(loginForm) {
	abortAll = false;
	$.post(api_host + api_path.login, loginForm.serialize())
		.done(function (data) {
			if (data['uid'] && data['sid']) {
				uid = data['uid'];
				sid = data['sid'];
				login = $('input[name="username"]', $controlForm).val();
				setCookie('uid', uid);
				setCookie('sid', sid);
				setCookie('login', login);
				setCookie('api_host', api_host);
				$(document).trigger("loginSuccess");
				return true;
			}
		})
		.fail(function (x, s, m) {
			$(document).trigger("loginError", [s + ": " + m]);
		});
}

function logOut() {
	uid = null;
	sid = null;
	login = null;
	setCookie('uid', uid, -1);
	setCookie('sid', sid, -1);
	setCookie('login', login, -1);
	setCookie('api_host', api_host, -1);
	$(document).trigger("logOut");

}

function clearStorage() {
	localStorage.clear();
}

function searchImages() {
	abortAll = false;
	$infoPanel.html('');
	$imgPanel.html('');
	updatePercent(0);
	showMessage("Starting...");

	var username = $('input[name="username"]', $controlForm).val();
	var where = $('input[name="where"]:checked', $controlForm).val();
	var searchUrl = api_host + api_path[where].replace('%s', username);

	var posts;
	var links = {};
	var fields = ['main_image_url', 'body', 'id', 'rating', 'domain.idna_url', 'domain.url', 'post.id', '_links[0].href'];
	var postcomms = where === 'comments' ? 'comments' : 'posts';

	fetch(searchUrl, {
		method: 'GET',
		cache: 'default',
		headers: {'X-Futuware-UID': uid, 'X-Futuware-SID': sid}
	}).then(function (response) {
		if(response.ok) {
			return response.json();
		}
		else {
			return Promise.reject(response);
		}
	}).then(function (pageData) {
		if (pageData['item_count']) {
			var cachedPage = JSON.parse(localStorage.getItem(searchUrl + '_page'));
			if (!cachedPage || cachedPage['item_count'] !== pageData['item_count'] || !localStorage.getItem(searchUrl + '_links')) {
				localStorage.setItem(searchUrl + '_page', JSON.stringify(pageData));
				localStorage.removeItem(searchUrl + '_links');
				var item_count = pageData['item_count'];
				var page_count = pageData['page_count'];
				posts = extract_fields(pageData[postcomms], fields);
				if (item_count > 42) {
					var pages_returned = 1;
					for (var page_num = 2; page_num <= page_count; page_num++) {
						var page = searchUrl + "?page=" + page_num;
						(function (_page_num) {
							fetch(page, {method: "GET", headers: {'X-Futuware-UID': uid, 'X-Futuware-SID': sid}})
								.then(function (response) {
									if(response.ok) {
										return response.json();
									}
									else {
										return Promise.reject(response);
									}
								})
								.then(function (result) {
									var post_index = (_page_num - 1) * 42;
									var page_posts = extract_fields(result[postcomms], fields);
									for (var pp in page_posts) {
										// noinspection JSUnfilteredForInLoop
										posts[post_index] = page_posts[pp];
										post_index++;
									}
								})
								.catch(function (error) {
									console.log(error);
								})
								.then(function () {
									pages_returned++;
									var percent = Math.round(pages_returned / page_count * 100);
									var msg = "Getting pages : " + percent + " %";
									showMessage(msg);
									updatePercent(percent);

									if (pages_returned === page_count) {
										$(document).trigger("posts-ready");
									}
								});
						})(page_num);
					}
				}
				else {
					$(document).trigger("posts-ready");
				}
			}
			else {
				$(document).trigger("posts-ready");
			}
		}
		else {
			showError("The user has no posts");
		}
	}).catch(function (error) {
		console.log(error);
		showError("Couldn't get " + where + ": " + error.statusText);
	});

	$(document).one('posts-ready', function () {
		updatePercent(100);
		showMessage("Finished getting pages");
		if (localStorage.getItem(searchUrl + '_links')) {
			links = JSON.parse(localStorage.getItem(searchUrl + '_links'));
		}
		if(! Object.keys(links).length) {
			links = getLinks(links, posts);
			if(Object.keys(links).length) localStorage.setItem(searchUrl + '_links', JSON.stringify(links));
		}
		showResult(searchUrl);
	});
}

function showResult(searchUrl) {

	var $controlForm = $('#controlform');
	var username = $('input[name="username"]', $controlForm).val();
	var where = $('input[name="where"]:checked', $controlForm).val();
	var cachedData = JSON.parse(localStorage.getItem(searchUrl + '_page'));
	var links = JSON.parse(localStorage.getItem(searchUrl + '_links'));
	if (!cachedData || !links) {
		showError("Couldn't get result from cache");
		return;
	}
	var infohtml = '<p class="info">' + where + ': ' + cachedData['item_count'] + '; images found: ' + Object.keys(links).length + '</p>';
	infohtml += '<button id="previewBtn">Preview</button></p>';
	infohtml += '<button id="saveBtn">Save</button></p>';
	$infoPanel.html(infohtml);

	$('#previewBtn').on("click", function () {
		$imgPanel.html('');
		$('#debug').hide();
		var gap = parseInt($imgPanel.css('column-gap'));
		var cc = Math.ceil(($imgPanel.width() + gap) / (120 + gap) - 1);
		$imgPanel.css({columnCount: cc});
		updatePercent(0);


		var urls = $(Object.keys(links));
		var img_count = urls.length;
		var img_loaded = 0;
		var img_error = 0;

		urls.each(function (index, link) {
			var postLink = $('<a class="img_link" href="' + links[link]['url'] +'" style="display: none"><span class="rating">'+ links[link]['rating'] +'</span></a>');

			var src = link.replace(/w=\d+/, 'w=120');

			var newImg = $('<img class="item" alt="' + src + '" src="' + src + '" />');

			newImg.one("error", function () {
				img_error++;
				previewProgress(img_loaded, img_error, img_count);
			}).one("load", function () {
				img_loaded++;
				postLink.show();
				previewProgress(img_loaded, img_error, img_count);
			}).each(function () {
				if (this.complete) $(this).load();
			});

			postLink.append(newImg);
			$imgPanel.append(postLink);
		});
	});

	var previewProgress = function (loaded, failed, total) {
		var percent = Math.round((loaded + failed) / total * 100);
		var msg = "Getting Images : " + (loaded + failed) + "(" + percent + " %)";
		showMessage(msg);
		updatePercent(percent);
		if (loaded + failed === total) {
			showMessage("Finished getting images. " + loaded + " loaded, " + failed + ' failed');
		}
	};

	$('#saveBtn').on("click", function () {
		$('#debug').hide();
		abortAll = false;
		updatePercent(0);
		showMessage("Started download of original images");
		var zip = new JSZip();
		var count = {s:  0, e: 0, t: 0};
		var name = username + "_" + where + "_allImages.zip";
		var urls = $(Object.keys(links));

		var startTime = null;
		var bytes = 0;
		var total = urls.length;
		var filenames = {};
		var failedUrls = [];

		var fetchUrl = function(index, url) {

			if(abortAll)
				return;

			url = url.replace(/\??w=\d+/, '');
			var filename = url.substring(url.lastIndexOf('/') + 1);

			fetch(url, {method: 'GET', cache: 'default'})
			.then(function (response) {
				if (response.ok) {
					return response.blob();
				}
				else {
					return Promise.reject(response);
				}
			})
			.then(function (data) {
				if (!startTime)
					startTime = (new Date()).getTime();
				// noinspection Annotator
				bytes += data.size;
				count['s']++;
				if (filenames[filename]) {
					// console.log(filename + ' => ' + count['t'] + "_" + filename);
					filename = count['t'] + "_" + filename;
				}
				filenames[filename] = 1;
				zip.file(filename, data, {binary: true});
			}).catch(function (err) {
				failedUrls.push(url);
				count['e']++;
				console.log(err)
			}).then(function () {

				if(urls.length > 0 && ! abortAll ) {
					var next = urls.splice(0,1);
					fetchUrl(0, next[0]);
				}
				count['t']++;
				var percent = Math.round(count['t'] / total * 100);
				var currentTime = (new Date()).getTime() - startTime;
				var speed = (bytes / (currentTime / 1000) / 1024).toFixed(2);
				showMessage(
					"Downloading file: " + count['t']
					+ " ( " + count['s'] + " OK, " + count['e'] + " failed )  - "
					+ percent + "%  at " + speed + " kB/s"
				);
				updatePercent(percent);
				if (count['t'] === total) {
					if(failedUrls.length > 0) {
						$('#debug').show().text(JSON.stringify(failedUrls, null, "\t"));
					}
					zip.generateAsync({type: 'blob'}, function updateCallback(metadata) {
						var msg = "Compressing " + count['s'] + " files (" + metadata.percent.toFixed(2) + " %)";
						if (metadata.currentFile) {
							msg += ", current file = " + metadata.currentFile;
						}
						showMessage(msg);
						updatePercent(metadata.percent | 0);
					}).then(function (content) {
						saveAs(content, name);
					});
				}
			});

		};

		var psize = 30;

		var pool = urls.splice(0, psize);

		$(pool).each(fetchUrl);

	});
}

function extract_fields(posts, fields) {
	var pruned = [];
	for (var p in posts) {
		var post = {};
		for (var f in fields) {
			// noinspection JSUnfilteredForInLoop
			var val = Object.byString(posts[p], fields[f]);
			if (val !== undefined) {
				post[fields[f]] = val;
			}
		}
		pruned.push(post);
	}
	return pruned;
}

function getLinks(links, posts) {

	var where = $('input[name="where"]:checked', $controlForm).val();

	for (var p in posts) {
		if (posts[p]['body']) {
			var body = posts[p]['body'];
			var imgs = body.match(/(<img.*?>)/);
			if(imgs) {
				for (var i = 1; i < imgs.length; i++) {
					var img = imgs[i];
					var m = img.match(/src="(.*?)"/);
					var src = m ? m[1]: null;
					if(src) {
						m = img.match(/width="(.*?)"/);
						var width = m ? parseInt(m[1]) : null;
						m = img.match(/height="(.*?)"/);
						var height = m ? parseInt(m[1]) : null;
						links[src] = { //TODO multiple comments per same image
							url: where === 'comments' ? posts[p]['domain.idna_url'] + "/comments/" + posts[p]['post.id'] + "/#" + posts[p]['id'] : posts[p]['_links[0].href'],
							rating: posts[p]['rating'],
							width: width,
							height: height
						};
					}
				}
			}
		}
		else if (posts[p]['main_image_url']) {
			links[posts[p]['main_image_url']] = {
				url: where === 'comments' ? posts[p]['domain.idna_url'] + "/comments/" + posts[p]['post.id'] + "/#" + posts[p]['id'] : posts[p]['_links[0].href'],
				rating: posts[p]['rating']
			};
		}
	}
	return links;
}

function setCookie(key, value, expires) {
	var defValidity = 1000 * 3600 * 24 * 7;
	var newDate = new Date();
	if (expires && expires === parseInt(expires)) {
		newDate.setTime(newDate.getTime() + expires);
	}
	else if (expires && expires instanceof Date) {
		newDate = expires;
	}
	else {
		newDate.setTime(newDate.getTime() + defValidity);
	}
	if (newDate instanceof Date) {
		if(window.location.protocol === 'file:') {
			localStorage.setItem(key, JSON.stringify({value: value, expires: newDate.toUTCString()}));
		}
		else {
			document.cookie = key + '=' + value + ';expires=' + newDate.toUTCString();
		}
		return;
	}
	console.err("setCookie failed - expiration value is invalid: " + newDate);
}

function getCookie(key) {

	if(window.location.protocol === 'file:') {
		var cookie = JSON.parse(localStorage.getItem(key));
		if(cookie) {
			if(Date.now() < Date.parse(cookie.expires)) {
				return cookie.value;
			}
			else {
				localStorage.removeItem(key);
			}
		}
	}
	else {
		var re = '(^|;) ?' + key + '=([^;]*)(;|$)';
		var keyValue = document.cookie.match(new RegExp(re));
		return keyValue ? keyValue[2] : null;
	}
}

function resetMessage() {
	$("#result")
		.removeClass()
		.text("");
}

function showMessage(text) {
	resetMessage();
	$("#result")
		.addClass("alert alert-success")
		.append(text);
}

function showError(text) {
	resetMessage();
	$("#result")
		.addClass("alert alert-danger")
		.text(text);
}

function updatePercent(percent) {
	$("#progress_bar").removeClass("hide")
		.find(".progress-bar")
		.attr("aria-valuenow", percent)
		.css({
			width: percent + "%"
		});
}

// https://stackoverflow.com/a/6491621/2982719
Object.byString = function(o, s) {
	s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
	s = s.replace(/^\./, '');           // strip a leading dot
	var a = s.split('.');
	for (var i = 0, n = a.length; i < n; ++i) {
		var k = a[i];
		if (k in o) {
			o = o[k];
		} else {
			return;
		}
	}
	return o;
};