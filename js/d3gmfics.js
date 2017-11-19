
var uid = getCookie("uid");
var sid = getCookie("sid");
var login = getCookie("login");


var d3host = "https://d3.ru";
var api_path = {
	login: "/api/auth/login/",
	posts: "/api/users/%s/posts/",
	favourites: "/api/users/%s/favourites/posts/"
};

var loginForm;

$(function(){

	loginForm = $('#loginform');
	loginForm.on('submit', function(e) {
		e.preventDefault();
		logIn($(this));
		return false;
	});


	if(! uid || ! sid) {
		showLogin();
	}
	else {
		showContent();
	}

	$(document).on('loginSuccess', function() {
		loginForm.get(0).reset();
		showContent();

	});
	$(document).on('logOut', function() {
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
	setCookie('login', login,-1);
	$(document).trigger("logOut");

}

function searchImages() {
	$controlForm = $('#controlform');
	username = $('input[name="username"]', $controlForm).val();
	where =  $('input[name="where"]:checked', $controlForm).val();
	$.ajax({
		url: d3host + api_path[where].replace('%s', username),
		method: 'GET',
		headers: {'X-Futuware-UID' : uid, 'X-Futuware-SID': sid }
	}).done(function(data) {
		if(data['item_count']) {
			item_count = data['item_count'];
			page_count = data['page_count'];
			posts = tags = [];
			links = {};
			fields = ['main_image_url', 'tags'];
			posts = extract_fields(data['posts'], fields);
			console.log(data);
			console.log(posts);
			for(p in posts) {
				if(posts[p]['main_image_url']) {
					links[posts[p]['main_image_url']] = { tags: posts[p]['tags']};
				}
			}

			console.log(links);
			$('.ipanel').html('<p class="info">' + where + ' posts: ' + item_count + '; Found images: ' + Object.keys(links).length +'</p>');
////			infohtml += '<button id="saveBtn">Save</button></p>';
////			if ($item_count > 42) {
		}
	}).fail(function(e, x, s, m) {

	});
}


function extract_fields(posts, fields) {
	pruned = [];
	for (p in posts) {
		var post = {};
		for(f in fields) {
			if(posts[p][fields[f]]) {
				post[fields[f]] = posts[p][fields[f]];
			}
		}
		pruned.push(post);
	}
	return pruned;
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
	if(newDate instanceof Date) {
		document.cookie = key + '=' + value + ';expires=' + newDate.toUTCString();
		return;
	}
	console.err("setCookie failed - expiration value is invalid: " + newDate);
}

function getCookie(key) {
	var keyValue = document.cookie.match('(^|;) ?' + key + '=([^;]*)(;|$)');
	return keyValue ? keyValue[2] : null;
}