var uid = getCookie("uid");
var sid = getCookie("sid");
var login = getCookie("login");


var d3host = "https://d3.ru";
var api_path = {
	login: "/api/auth/login/",
	posts: "/api/users/%s/posts/",
	favourites: "/api/users/%s/favourites/posts/"
};

var parallel_pages = 20;
var img_loaded = 0;
var img_error = 0;
var img_count = 0;

var loginForm;

$(function () {

	loginForm = $('#loginform');
	loginForm.on('submit', function (e) {
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
		loginForm.get(0).reset();
		showContent();

	});
	$(document).on('logOut', function () {
		showLogin();
	});
	$(document).on("click", '#logoutLink', logOut);
	$(document).on("click", '#searchBtn', searchImages);

});


function showLogin() {
	$('.content_wrapper').hide();
	$('.login_wrapper').show()
}

function showContent() {
	$('.login_wrapper').hide();
	$('#upanel').html("<dl id='userData'><dt>Logged in as: </dt><dd>" + login + "</dd>,<dt>ID:</dt><dd>" + uid + '</dd></dl><span id="logoutLink">Logout</span>');
	$('#controlform input[name="username"]').val(login);
	$('.content_wrapper').show();
}

function logIn(loginForm) {
	$.post(d3host + api_path.login, loginForm.serialize())
		.done(function (data) {
			if (data['uid'] && data['sid']) {
				uid = data['uid'];
				sid = data['sid'];
				login = data['user']['login'];
				setCookie('uid', uid);
				setCookie('sid', sid);
				setCookie('login', login);
				$(document).trigger("loginSuccess");
				return true;
			}
		})
		.fail(function (e, x, s, m) {
			$(document).trigger("loginError", x.statusCode + " " + x.statusText);
		});
}

function logOut() {
	uid = null;
	sid = null;
	login = null;
	setCookie('uid', uid, -1);
	setCookie('sid', sid, -1);
	setCookie('login', login, -1);
	$(document).trigger("logOut");

}

function searchImages() {
	$('.ipanel').html('');
	$('#imgPane').html('');
	updatePercent(0);
	showMessage("Starting...");

	var $controlForm = $('#controlform');
	var username = $('input[name="username"]', $controlForm).val();
	var where = $('input[name="where"]:checked', $controlForm).val();
	var searchUrl = d3host + api_path[where].replace('%s', username);

	var posts = tags = []; //Or {}
	var links = {};
	var fields = ['main_image_url', 'tags'];

	$.ajax({
		url: searchUrl,
		method: 'GET',
		cache: true,
		headers: {'X-Futuware-UID': uid, 'X-Futuware-SID': sid}
	}).done(function (pageData) {
		if (pageData['item_count']) {
			var cachedPage = JSON.parse(localStorage.getItem(searchUrl + '_page'));
			if (!cachedPage || cachedPage['item_count'] != pageData['item_count'] || !localStorage.getItem(searchUrl + '_links')) {
				localStorage.setItem(searchUrl + '_page', JSON.stringify(pageData));
				localStorage.removeItem(searchUrl + '_links');
				item_count = pageData['item_count'];
				page_count = pageData['page_count'];
				posts = extract_fields(pageData['posts'], fields);

				if (item_count > 42) {
					$(document).one("ma-started", function () {
						pages_returned = 1;
						$(document).off("ma-page").on("ma-page", function (e, result) {
							var post_index = (parseInt(result['index']) + 1) * 42;
							if (result['response']) {
								var page_posts = extract_fields(result['response']['posts'], fields);
								for (var pp in page_posts) {
									posts[post_index] = page_posts[pp];
									post_index++;
								}
							}
							else if (result['error']) {
								console.log(result);
							}
							pages_returned++;
							var percent = pages_returned / page_count * 100;
							var msg = "Getting pages : " + percent.toFixed(2) + " %";
							showMessage(msg);
							updatePercent(Math.round(percent));
						});
						$(document).one("ma-finished", function () {
							$(document).trigger("posts-ready");
						});
					});

					var pages = [];
					for (page_num = 2; page_num <= page_count; page_num++) {
						pages.push(searchUrl + "?page=" + page_num);
					}
					multiAjax(pages, 'GET', {'X-Futuware-UID': uid, 'X-Futuware-SID': sid}, null);
				}
				else {
					$(document).trigger("posts-ready");
				}
			}
			else {
				$(document).trigger("posts-ready");
			}
		}
	}).fail(function (x, s, m) {
		showError("Couldn't get posts." + s + " : " + m);
	});

	$(document).one('posts-ready', function () {
		updatePercent(100);
		showMessage("Finished getting pages");
		if (localStorage.getItem(searchUrl + '_links')) {
			links = JSON.parse(localStorage.getItem(searchUrl + '_links'));
		}
		else {
			links = getLinks(links, posts);
			localStorage.setItem(searchUrl + '_links', JSON.stringify(links));
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
	infohtml = '<p class="info">' + where + ': ' + cachedData['item_count'] + '; images found: ' + Object.keys(links).length + '</p>'
	infohtml += '<button id="previewBtn">Preview</button></p>';
	infohtml += '<button id="saveBtn">Save</button></p>';
	$('.ipanel').html(infohtml);
//
	$('#previewBtn').on("click", function () {
		$('#imgPane').html('');
		gap = parseInt($('#imgPane').css('column-gap'));
		cc = Math.ceil(($('#imgPane').width() + gap) / (120 + gap) - 1);
		$('#imgPane.masonry').css({columnCount: cc})
		updatePercent(0);
		img_count = Object.keys(links).length;
		img_loaded = 0;
		$(Object.keys(links)).each(function (index, link) {
			var src = link.replace(/w=\d+/, 'w=120');

			newImg = $('<img class="item" alt="' + src + '" />');

			newImg.one("error", function () {
				img_error++;
				console.log("Failed loading image:");
				console.log(arguments);
				setTimeout(function () {
					$(this).src += '?' + new Date;
				}, 500);
			});
			newImg.one("load", function () {
				img_loaded++;
				percent = img_loaded / img_count * 100;
				var msg = "Getting Images : " + img_loaded + "(" + Math.round(percent) + " %)";
				showMessage(msg);
				updatePercent(Math.round(percent));
				if (img_loaded == img_count) {
					showMessage("Finished getting images");
				}
			}).each(function () {
				if (this.complete) $(this).load();
			});

			newImg.attr('src', src);

			$('#imgPane').append(newImg);
		});
	});


	$('#saveBtn').on("click", function () {
		updatePercent(0);
		showMessage("Started download of original images");
		var zip = new JSZip();
		var count = 0;
		var name = username + "_" + where + "_allImages.zip";
		var urls = $(Object.keys(links));

		urls.each(function (index, url) {
			url = url.replace(/\??w=\d+/, '');
			var filename = url.substring(url.lastIndexOf('/') + 1);
			setTimeout(function () {
				binaryXmlHttpRequest(url, "GET")
					.then(function (data) {
						zip.file(filename, data, {binary: true});
					}).catch(function (err) {
					console.log(err)
				}).then(function () {
					count++;
					percent = Math.round(count / urls.length * 100);
					showMessage("Downloading file: " + count + "(" + percent + " %)");
					updatePercent(percent);
					if (count == urls.length) {
						zip.generateAsync({type: 'blob'}, function updateCallback(metadata) {
							var msg = count + "(" + metadata.percent.toFixed(2) + " %)";
							if (metadata.currentFile) {
								msg += ", current file = " + metadata.currentFile;
							}
							showMessage(msg);
							updatePercent(metadata.percent | 0);
						}).then(function (content) {
							saveAs(content, name);
							showMessage("Download finished");
						});
					}
				});
			}, 100);
		});
	});
}

function extract_fields(posts, fields) {
	pruned = [];
	for (p in posts) {
		var post = {};
		for (f in fields) {
			if (posts[p][fields[f]]) {
				post[fields[f]] = posts[p][fields[f]];
			}
		}
		pruned.push(post);
	}
	return pruned;
}

function getLinks(links, posts) {
	for (p in posts) {
		if (posts[p]['main_image_url']) {
			links[posts[p]['main_image_url']] = {tags: posts[p]['tags']};
		}
	}
	return links;
}

function multiAjax(urls, method, headers, data) {
	queue = [];
	$(document).trigger("ma-started");
	$.each(urls, function (u, url) {
		queue.push(
			$.ajax({
				url: url,
				method: method,
				headers: headers,
				cache: true,
				//				ifModified: true,
				data: data
			}).done(function (response) {
				$(document).trigger("ma-page", {index: u, response: response});
			}).fail(function (x, s, m) {
				console.log('ma-page fail: ' + s + ' : ' + m + ' : ' + x.statusText);
				$(document).trigger("ma-page", {index: u, error: s || x.statusText});
			})
		);
	});
	$.when.apply($, queue).then(function () {
		$(document).trigger("ma-finished");
	});
}

function binaryXmlHttpRequest(url, method, headers, data) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open(method, url);
		// xhr.timeout = 500;
		xhr.responseType = "blob";
		xhr.onload = function () {
			if (this.status >= 200 && this.status < 300) {
				resolve(xhr.response);
			}
			else {
				reject({
					status: this.status,
					statusText: xhr.statusText
				});
			}
		};
		xhr.onerror = function () {
			reject({
				status: this.status,
				statusText: xhr.statusText
			});
		};
		xhr.send();
	});
}

function setCookie(key, value, expires) {
	var defValidity = 1000 * 3600 * 24 * 7;
	var newDate = new Date();
	if (expires && Number.isInteger(expires)) {
		newDate.setTime(newDate.getTime() + expires);
	}
	else if (expires && expires instanceof Date) {
		newDate = expires;
	}
	else {
		newDate.setTime(newDate.getTime() + defValidity);
	}
	if (newDate instanceof Date) {
		document.cookie = key + '=' + value + ';expires=' + newDate.toUTCString();
		return;
	}
	console.err("setCookie failed - expiration value is invalid: " + newDate);
}

function getCookie(key) {
	var keyValue = document.cookie.match('(^|;) ?' + key + '=([^;]*)(;|$)');
	return keyValue ? keyValue[2] : null;
}

/**
 * Reset the message.
 */
function resetMessage() {
	$("#result")
		.removeClass()
		.text("");
}

/**
 * show a successful message.
 * @param {String} text the text to show.
 */
function showMessage(text) {
	resetMessage();
	$("#result")
		.addClass("alert alert-success")
		.text(text);
}

/**
 * show an error message.
 * @param {String} text the text to show.
 */
function showError(text) {
	resetMessage();
	$("#result")
		.addClass("alert alert-danger")
		.text(text);
}

/**
 * Update the progress bar.
 * @param {Integer} percent the current percent
 */
function updatePercent(percent) {
	$("#progress_bar").removeClass("hide")
		.find(".progress-bar")
		.attr("aria-valuenow", percent)
		.css({
			width: percent + "%"
		});
}