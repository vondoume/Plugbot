
define('app/models/3rd/PlugBot',
	[
		'jquery',
		'app/base/Context',
		'app/models/PlaybackModel',
		'app/views/room/PlaybackView',
		'app/models/RoomModel',
		'app/views/room/meta/AvatarRolloverView',
		'app/models/3rd/EmojiUI'
	],
	function(
		$,
		BaseContext,
		PlaybackModel,
		PlaybackView,
		RoomModel,
		AvatarRolloverView,
		EmojiUIModel
	) {
	/**
	 * NOTE:  This is 100% procedural because I can't see a reason to add classes, etc.
	 *
	 * @author 	Conner Davis (Fruity Loops)
	 */
	/* ###
	 * Whether the user has currently enabled auto-woot/auto-meh
	 */
	var autowoot;
	var automeh = false;
	/*
	 * Whether the user has currently enabled auto-queueing.
	 */
	var autoqueue;
	/*
	 * Whether or not the user has enabled hiding this video.
	 */
	var hideVideo;
	/* ###
	 * Whether or not the user has enabled the userlist.
	 */
	var userList;
	var timeout_updateUserList; // timeout delay to update user-list
	var time_lastUpdateUserList = 0; // last time of updating user-list
	var INTERVAL_UPDATEUsERLiST = 3000; // interval to update user-list, msec
	/*
	 * Whether the current video was skipped or not.
	 */
	var skippingVideo = false;
	/* ###
	 * Previous volume
	 */
	var lastVolume = 50;
	/* ###
	 * Hide video temporarily, set to true when user clicks SKIP VIDEO but not hiding video
	 */
	var hideVideoTemp = false;
	/* ###
	 * Current playing video url
	 */
	var vidURL = '';
	/* ###
	 * Original animation speed
	 */
	var oriAnimSpeed = 0;
	/* ###
	 * Is webpage visible
	 */
	var isWebVisible = true;

	/*
	 * Cookie constants
	 */
	var COOKIE_WOOT = 'autowoot';
	var COOKIE_QUEUE = 'autoqueue';
	var COOKIE_HIDE_VIDEO = 'hidevideo';
	var COOKIE_USERLIST = 'userlist';

	/*
	 * Maximum amount of people that can be in the waitlist.
	 */
	var MAX_USERS_WAITLIST = 50;

	/** ###
	 * Initialise all of the Plug.dj API listeners which we use
	 * to asynchronously intercept specific events and the data
	 * attached with them.
	 */
	function initAPIListeners()
	{
		/*
		 * This listens in for whenever a new DJ starts playing.
		 */
		API.on(API.DJ_ADVANCE, djAdvanced);

		/*
		 * This listens for changes in the waiting list
		 */
		API.on(API.WAIT_LIST_UPDATE, queueUpdate);

		/*
		 * This listens for changes in the dj booth
		 */
		API.on(API.DJ_UPDATE, queueUpdate);

		/*
		 * This listens for whenever a user in the room either WOOT!s
		 * or Mehs the current song.
		 */
		API.on(API.VOTE_UPDATE, function (obj)
		{
			populateUserlist();
		});

		/*
		 * Whenever a user joins, this listener is called.
		 */
		API.on(API.USER_JOIN, function (user)
		{
			populateUserlist();
		});

		/*
		 * Called upon a user exiting the room.
		 */
		API.on(API.USER_LEAVE, function (user)
		{
			populateUserlist();
		});

		/* ###
		 * Called upon receiving a message
		 */
		API.on(API.CHAT, EmojiUIModel.onChatReceived, EmojiUIModel);
		BaseContext.on("chat:send", EmojiUIModel.onChatReceived, EmojiUIModel);
	}


	/**
	 * Renders all of the Plug.bot "UI" that is visible beneath the video
	 * player.
	 */
	function displayUI()
	{
		/*
		 * Be sure to remove any old instance of the UI, in case the user
		 * reloads the script without refreshing the page (updating.)
		 */
		$('#plugbot-ui').remove();

		/* ###
		 * Generate the HTML code for the UI.
		 */
		$('#chat').prepend('<div id="plugbot-ui" class="unselectable"></div>');

		var cWoot = autowoot ? '#3FFF00' : '#ED1C24';
		var cMeh = automeh ? '#3FFF00' : '#ED1C24'; // ### auto-meh
		var cQueue = autoqueue ? '#3FFF00' : '#ED1C24';
		var cHideVideo = hideVideo ? '#3FFF00' : '#ED1C24';
		var cUserList = userList ? '#3FFF00' : '#ED1C24';

		// ###
		$('#plugbot-ui').append(
			'<p id="plugbot-btn-woot" style="color:' + cWoot +
			'">auto-woot</p><p id="plugbot-btn-meh" style="color:' + cMeh +
			'">auto-meh</p><p id="plugbot-btn-queue" style="color:' + cQueue +
			'">auto-queue</p><p id="plugbot-btn-hidevideo" style="color:' + cHideVideo +
			'">hide video</p><p id="plugbot-btn-skipvideo" style="color:#ED1C24">skip video</p><p id="plugbot-btn-userlist" style="color:' + cUserList + '">userlist</p>' +
			'<p><a href="' + vidURL + '" target="_blank" id="plugbot-btn-openvid" style="color:#FFF">open video link</a></p>');
	}

	/** ###
	 * \brief	Display emoticons
	 */
	function displayEmoticons() {
		// chat fields
		var chatInput = $('.chat-input');
		var chatInputField = $('#chat-input-field');
		var dialogBox = $('#dialog-box');

		// emoticons buttons (div -> span)
		var emoticonsButton_smile = $('<span/>', {
			'class': 'emoji emoji-1f603'
		}).css({
			margin: '3px 0 0 3px'
		});
		var emoticonsButton = $('<div/>', {
			id: 'emoji-button',
			title: 'Insert Emoticons'
		}).css({
			position: 'absolute',
			width: '22',
			height: '24',
			right: '0',
			cursor: 'pointer'
		});


		// remove old elements
		$('#emoji-button').remove();
		$('#dialog-emoticons').remove();

		// set chat field style
		chatInputField.css('width', '267px');

		// append emoticons button to input field
		emoticonsButton_smile.appendTo(emoticonsButton)
		emoticonsButton.appendTo(chatInput);

		// bind handler to EmojiUI
		EmojiUIModel.initHandlers1();
	}

	/** ###
	 * For every button on the Plug.bot UI, we have listeners backing them
	 * that are built to intercept the user's clicking each button.  Based
	 * on the button that they clicked, we can execute some logic that will
	 * in some way affect their experience.
	 */
	function initUIListeners()
	{
		/* ###
		 * Windows resize event
		 */
		$(window).resize(function() {
			EmojiUIModel.repos();
		});

		/* ###
		 * Body key down/up
		 */
		$("body").keydown( $.proxy(EmojiUIModel.onBodyKeydown, EmojiUIModel) )
				.keyup( $.proxy(EmojiUIModel.onBodyKeyup, EmojiUIModel) );

		/* ###
		 * Chat-input key down: restore history chat
		 */
		$("#chat-input-field").keydown( $.proxy(EmojiUIModel.onChatInputKeydown, EmojiUIModel) );

		/* ###
		 * Chat expands/collapses
		 */
		$('#button-chat-expand').click(function() {
			setTimeout(function() {
				EmojiUIModel.repos();
			}, 100);
		});
		$('#button-chat-collapse').click(function() {
			setTimeout(function() {
				EmojiUIModel.repos();
			}, 100);
		});

		/* ###
		 * Toggle userlist.
		 */
		$('#plugbot-btn-userlist').live("click", function() // ### .live()
		{
			userList = !userList;
			$(this).css('color', userList ? '#3FFF00' : '#ED1C24');
			$('#plugbot-userlist').css('visibility', userList ? 'visible' : 'hidden');

			if (!userList)
			{
				$('#plugbot-userlist').empty();
			}
			else
			{
				// reset time to force userlist to refresh
				time_lastUpdateUserList = 0;
				// refresh
				populateUserlist();
			}
			jaaulde.utils.cookies.set(COOKIE_USERLIST, userList);
		});

		/* ###
		 * Toggle auto-woot.
		 */
		$('#plugbot-btn-woot').live('click', function() // ### .live()
		{
			autowoot = !autowoot;
			(autowoot) &&
				(automeh = false);

			$(this).css('color', autowoot ? '#3FFF00' : '#ED1C24');
			$('#plugbot-btn-meh').css('color', automeh ? '#3FFF00' : '#ED1C24');

			if (autowoot) {
				$('#button-vote-positive').click();
			}

			jaaulde.utils.cookies.set(COOKIE_WOOT, autowoot);
		});

		/* ###
		 * Toggle auto-meh.
		 */
		$('#plugbot-btn-meh').live('click', function() // ### .live()
		{
			automeh = !automeh;
			(automeh) &&
				(autowoot = false);

			$(this).css('color', automeh ? '#3FFF00' : '#ED1C24');
			$('#plugbot-btn-woot').css('color', autowoot ? '#3FFF00' : '#ED1C24');

			if (automeh) {
				$('#button-vote-negative').click();
			}
		});

		/*
		 * Toggle hide video.
		 */
		$('#plugbot-btn-hidevideo').live('click', function() // ### .live()
		{
			hideVideo = !hideVideo;
			$(this).css('color', hideVideo ? '#3FFF00' : '#ED1C24');
			$(this).text(hideVideo ? 'hiding video' : 'hide video');
			$('#yt-frame').animate(
			{
				'height': (hideVideo ? '0px' : '271px')
			},
			{
				duration: 'fast'
			});
			$('#playback .frame-background').animate(
			{
				'opacity': (hideVideo ? '0' : '0.91')
			},
			{
				duration: 'medium'
			});
			jaaulde.utils.cookies.set(COOKIE_HIDE_VIDEO, hideVideo);
		});

		/* ###
		 * Skip current video.
		 */
		$('#plugbot-btn-skipvideo').live('click', function() // ### .live()
		{
			skippingVideo = !skippingVideo;
			$(this).css('color', skippingVideo ? '#3FFF00' : '#ED1C24');
			$(this).text(skippingVideo ? 'skipping video' : 'skip video');

			var volume = API.getVolume();

			// switch sound mute/on
			var soundOn = (0 !== volume);
			if (skippingVideo) {
				lastVolume = volume;
				API.setVolume(0);
			} else {
				API.setVolume(lastVolume);
			}

			// hide video
			if (skippingVideo) {
				if (!hideVideoTemp && !hideVideo) { // hide vid
					$('#plugbot-btn-hidevideo').click();
				}

				hideVideoTemp = true;
			} else {
				if (hideVideoTemp && hideVideo) { // show vid
					$('#plugbot-btn-hidevideo').click();
				}

				hideVideoTemp = false;
			}
		});

		/*
		 * Toggle auto-queue/auto-DJ.
		 */
		$('#plugbot-btn-queue').live('click', function() // ### .live()
		{
			autoqueue = !autoqueue;
			$(this).css('color', autoqueue ? '#3FFF00' : '#ED1C24');

			if (autoqueue && !isInQueue())
			{
				joinQueue();
			}
			jaaulde.utils.cookies.set(COOKIE_QUEUE, autoqueue);
		});

		/* ###
		 * Show user box
		 */
		$('.plugbot-userlist-user').live('click', function() { // ### .live()
			var pos = $(this).position();
			var user_name = $(this).text();
			var user_obj = null;

			$.each(RoomModel.get('users'), function(index, value) {
				if (value.get('username') === user_name) {
					user_obj = value;
					return false;
				}
			});

			AvatarRolloverView.showChat(user_obj, {x: pos.left + 300, y: pos.top});
		});

		// ### Init visibility watch
		init_visWatch();
	}

	/** ###
	 * Called whenever a new DJ begins playing in the room.
	 *
	 * @param obj
	 * 				This contains the current DJ's data.
	 */
	function djAdvanced(obj)
	{
		/*
		 * If they want the video to be hidden, be sure to re-hide it.
		 * ### but don't hide if user clicks SKIP VIDEO previously
		 */
		if (hideVideo &&
			!skippingVideo)
		{
			$('#yt-frame').css('height', '0px');
			$('#playback .frame-background').css('opacity', '.0');
		}

		if (skippingVideo)
		{
			// resume label
			$('#plugbot-btn-skipvideo').css('color', '#ED1C24').text('skip video');

			// show vid
			if (hideVideoTemp && hideVideo) {
				$('#plugbot-btn-hidevideo').click();
			}

			// resume sound
			API.setVolume(lastVolume);
			resetPlayback();

			skippingVideo = false;
			hideVideoTemp = false;
		}

		/* ###
		 * If auto-woot is enabled, WOOT! the song.
		 * otherwise, MEH! the song
		 */
		if (autowoot) { // WOOT
			$('#button-vote-positive').click();
		} else if (automeh) { // MEH
			$('#button-vote-negative').click();
		}

		/* ###
		 * If the userlist is enabled, re-populate it.
		 */
		populateUserlist();

		// ### update vid url
		updateVidURL(false);
	}

	/** ###
	 * Called whenever a change happens to the queue.
	 */
	function queueUpdate()
	{
		/*
		 * If auto-queueing has been enabled, and we are currently
		 * not in the waitlist, then try to join the list.
		 */
		if (autoqueue && !isInQueue())
		{
			joinQueue();
		}

		// reset time to force userlist to refresh
		time_lastUpdateUserList = 0;
		// refresh userlist
		populateUserlist();
	}

	/** ###
	 * Checks whether or not the user is already in queue.
	 *
	 * @return True if the user is in queue, else false.
	 */
	function isInQueue()
	{
		return API.getBoothPosition() !== -1 || API.getWaitListPosition() !== -1;
	}

	/**
	 * Tries to add the user to the queue or the booth if there is no queue.
	 *
	 */
	function joinQueue()
	{
		if ($('#button-dj-play').css('display') === 'block')
		{
			$('#button-dj-play').click();
		}
		else if (API.getWaitList().length < MAX_USERS_WAITLIST)
		{
			API.djJoin();
		}
	}

	/** ###
	 * Generates every user in the room and their current vote as
	 * colour-coded text.  Also, moderators get the star next to
	 * their name.
	 */
	function populateUserlist()
	{
		if ( !userList) { return; }

		// check if page is visible
		if ( !isWebVisible) { return; }

		// limit rate
		var dateNow = new Date();
		var tickNow = dateNow.getTime();
		dateNow = null;

		clearTimeout(timeout_updateUserList);
		if (tickNow - time_lastUpdateUserList >= INTERVAL_UPDATEUsERLiST) {
			time_lastUpdateUserList = tickNow;
		} else {
			timeout_updateUserList = setTimeout(function() {
				populateUserlist();
			}, INTERVAL_UPDATEUsERLiST);
			return;
		}

		var userListObj = $('#plugbot-userlist');
		var users = API.getUsers();
		/*
		 * Destroy the old userlist DIV and replace it with a fresh
		 * empty one to work with.
		 */
		userListObj.html(' ')
				.append('<h1 style="text-indent:12px;color:#42A5DC;font-size:14px;font-variant:small-caps;">Users: ' + users.length + '</h1>')
				.append('<p style="padding-left:12px;text-indent:0px !important;font-style:italic;color:#42A5DC;font-size:11px;">Click a username to<br />open user-box!</p><br />');

		/* ###
		 * If the user is in the waitlist, show them their current spot.
		 */
		if ($('#button-dj-waitlist-view').prop('title') !== '')
		{
			if ($('#button-dj-waitlist-leave').css('display') === 'block' &&
				($.inArray(API.getDJs(), API.getUser()) == -1)) {
				var spot = $('#button-dj-waitlist-view').prop('title').split('(')[1];
				spot = spot.substring(0, spot.indexOf(')'));
				userListObj.append('<h1 id="plugbot-queuespot"><span style="font-variant:small-caps">Waitlist:</span> ' + spot + '</h1><br />');
			}
		}

		/*
		 * Populate the users array with the next user
		 * in the room (this is stored alphabetically.)
		 */
		$.each(users, function(index, key) {
			appendUser(key);
		});
	}

	/** ###
	 * Appends another user's username to the userlist.
	 *
	 * @param username
	 * 				The username of this user.
	 * @param vote
	 * 				Their current 'vote', which may be:
	 * 					-1 	: Meh
	 *					0	: 'undecided' (hasn't voted yet)
	 * 					1	: WOOT!
	 */
	function appendUser(user)
	{
		var username = user.username;
		/*
		 * A new feature to Pepper, which is a permission value,
		 * may be 1-5 afaik.
		 *
		 * 1: normal (or 0)
		 * 2: bouncer
		 * 3: manager
		 * 4/5: (co-)host
		 */
		var permission = +(user.permission);
		var currentDJ = API.getDJs()[0];
		var userIsDJ = false;

		if ('undefined' !== currentDJ) {
			userIsDJ = (currentDJ.username == username);
		}

		/*
		 * For special users, we put a picture of their rank
		 * (the star) before their name, and colour it based
		 * on their vote.
		 */
		var imagePrefix;
		switch (permission)
		{
			case 0:
				imagePrefix = 'normal';
				break;
			case 1:
				imagePrefix = 'featured';
				break;
			case 2:
				imagePrefix = 'bouncer';
				break;
			case 3:
				imagePrefix = 'manager';
				break;
			case 4:
			case 5:
				imagePrefix = 'host';
				break;
			case 9:
			case 10:
				imagePrefix = 'admin';
				break;
		}

		/*
		 * If they're the current DJ, override their rank
		 * and show a different colour, a shade of blue,
		 * to denote that they're playing right now (since
		 * they can't vote their own song.)
		 */
		if (userIsDJ)
		{
			if (imagePrefix === 'normal')
			{
				drawUserlistItem('void', '#42A5DC', username);
			}
			else
			{
				drawUserlistItem(imagePrefix + '_current.png', '#42A5DC', username);
			}
		}
		else if (imagePrefix === 'normal')
		{
			/*
			 * If they're a normal user, they have no special icon.
			 */
			drawUserlistItem('void', colorByVote(user.vote), username);
		}
		else
		{
			/*
			 * Otherwise, they're ranked and they aren't playing,
			 * so draw the image next to them.
			 */
			drawUserlistItem(imagePrefix + imagePrefixByVote(user.vote), colorByVote(user.vote), username);
		}
	}

	/**
	 * Determine the color of a person's username in the
	 * userlist based on their current vote.
	 *
	 * @param vote
	 * 				Their vote: woot, undecided or meh.
	 */
	function colorByVote(vote)
	{
		if (!vote)
		{
			return '#fff'; // blame Boycey
		}
		switch (vote)
		{
			case -1:	// Meh
				return '#c8303d';
			case 0:	// Undecided
				return '#fff';
			case 1:	// Woot
				return '#c2e320';
		}
	}

	/**
	 * Determine the "image prefix", or a picture that
	 * shows up next to each user applicable in the userlist.
	 * This denotes their rank, and its color is changed
	 * based on that user's vote.
	 *
	 * @param vote
	 * 				Their current vote.
	 * @returns
	 * 				The varying path to the PNG image for this user,
	 * 				as a string.  NOTE:  this only provides the suffix
	 * 				of the path.. the prefix of the path, which is
	 * 				admin_, host_, etc. is done inside {@link #appendUser(user)}.
	 */
	function imagePrefixByVote(vote)
	{
		if (!vote)
		{
			return '_undecided.png'; // blame boycey again
		}
		switch (vote)
		{
			case -1:
				return '_meh.png';
			case 0:
				return '_undecided.png';
			case 1:
				return '_woot.png';
		}
	}

	/** ###
	 * Draw a user in the userlist.
	 *
	 * @param imagePath
	 * 				An image prefixed by their username denoting
	 * 				rank; bouncer/manager/etc. 'void' for normal users.
	 * @param color
	 * 				Their color in the userlist, based on vote.
	 * @param username
	 * 				Their username.
	 */
	function drawUserlistItem(imagePath, color, username)
	{
		var currentDJ = API.getDJs()[0];
		var userIsDJ = false;

		if ('undefined' !== currentDJ) {
			userIsDJ = (currentDJ.username == username);
		}

		/*
		 * If they aren't a normal user, draw their rank icon.
		 */
		if (imagePath !== 'void')
		{
			var realPath = 'http://www.theedmbasement.com/basebot/userlist/' + imagePath;
			$('#plugbot-userlist').append('<img src="' + realPath + '" align="left" style="margin-left:6px;margin-top:2px" />');
		}

		/* ###
		 * Write the HTML code to the userlist.
		 */
		$('#plugbot-userlist').append(
			'<p class="plugbot-userlist-user" style="cursor:pointer;' + (imagePath === 'void' ? '' : 'text-indent:6px !important;') + 'color:' + color + ';' + (userIsDJ ? 'font-size:15px;font-weight:bold;' : '') + '" >' + username + '</p>');
	}

	///////////////////////////////////////////////////////////
	////////// EVERYTHING FROM HERE ON OUT IS INIT ////////////
	///////////////////////////////////////////////////////////

	/*
	 * Clear the old code so we can properly update everything.
	 */
	$('#plugbot-userlist').remove();
	$('#plugbot-css').remove();
	$('#plugbot-js').remove();

	/*
	 * Include cookie library
	 *
	 * TODO Replace with equivalent jQuery, I'm sure it's less work than this
	 */
	var head = document.getElementsByTagName('head')[0];
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = 'http://cookies.googlecode.com/svn/trunk/jaaulde.cookies.js';
	script.onreadystatechange = function()
	{
		if (this.readyState == 'complete')
		{
			readCookies();
		}
	}
	script.onload = readCookies;
	head.appendChild(script);


	/**
	 * Read cookies when the library is loaded.
	 */
	function readCookies()
	{
		/*
		 * Changing default cookie settings
		 */
		var currentDate = new Date();
		currentDate.setFullYear(currentDate.getFullYear() + 1); //Cookies expire after 1 year
		var newOptions =
		{
			expiresAt: currentDate
		}
		jaaulde.utils.cookies.setOptions(newOptions);

		/*
		 * Read Auto-Woot cookie (true by default)
		 */
		var value = jaaulde.utils.cookies.get(COOKIE_WOOT);
		autowoot = value != null ? value : true;

		/*
		 * Read Auto-Queue cookie (false by default)
		 */
		value = jaaulde.utils.cookies.get(COOKIE_QUEUE);
		autoqueue = value != null ? value : false;

		/*
		 * Read hidevideo cookie (false by default)
		 */
		value = jaaulde.utils.cookies.get(COOKIE_HIDE_VIDEO);
		hideVideo = value != null ? value : false;

		/*
		 * Read userlist cookie (true by default)
		 */
		value = jaaulde.utils.cookies.get(COOKIE_USERLIST);
		userList = value != null ? value : true;

		onCookiesLoaded();
	}


	/*
	 * Write the CSS rules that are used for components of the
	 * Plug.bot UI.
	 */
	$('body').prepend('<style type="text/css" id="plugbot-css">#plugbot-ui { position: absolute; margin-left: 349px; }#plugbot-ui p { background-color: #0b0b0b; height: 32px; padding-top: 8px; padding-left: 8px; padding-right: 6px; cursor: pointer; font-variant: small-caps; width: 84px; font-size: 15px; margin: 0; }#plugbot-ui h2 { background-color: #0b0b0b; height: 112px; width: 156px; margin: 0; color: #fff; font-size: 13px; font-variant: small-caps; padding: 8px 0 0 12px; border-top: 1px dotted #292929; }#plugbot-userlist { border: 6px solid rgba(10, 10, 10, 0.8); border-left: 0 !important; background-color: #000000; padding: 8px 0px 20px 0px; width: 12%; }#plugbot-userlist p { margin: 0; padding-top: 4px; text-indent: 24px; font-size: 10px; }#plugbot-userlist p:first-child { padding-top: 0px !important; }#plugbot-queuespot { color: #42A5DC; text-align: left; font-size: 15px; margin-left: 8px }');
	$('body').append('<div id="plugbot-userlist"></div>');


	/**
	 * Continue initialization after user's settings are loaded
	 */
	function onCookiesLoaded()
	{
		/* ###
		 * Hit the woot button, if autowoot is enabled.
		 * Hit the meh button if disabled
		 */
		if (autowoot) {
			$('#button-vote-positive').click();
		} else if (automeh) {
			$('#button-vote-negative').click();
		}

		/*
		 * Auto-queue, if autoqueue is enabled and the list is not full yet.
		 */

		if (autoqueue && !isInQueue())
		{
			joinQueue();
		}

		/*
		 * Hide video, if hideVideo is enabled.
		 */
		if (hideVideo)
		{
			$('#yt-frame').animate(
			{
				'height': (hideVideo ? '0px' : '271px')
			},
			{
				duration: 'fast'
			});
			$('#playback .frame-background').animate(
			{
				'opacity': (hideVideo ? '0' : '0.91')
			},
			{
				duration: 'medium'
			});
		}

		/* ###
		 * Generate userlist, if userList is enabled.
		 */
		populateUserlist();

		/*
		 * Call all init-related functions to start the software up.
		 */
		initWatchRoomJoin(onRoomJoin); // ### init watch room joining
		injectCustomStyles(); // ### inject custom styles
		updateVidURL(true); // ### update video url
		suppressAlert(); // ### suppress alert function

		initAPIListeners();
		displayUI();
		initUIListeners();

		displayEmoticons(); // ### display emoticons
	}

	/* When joining a new room
	 */
	function onRoomJoin() {
		// reset time to force userlist to refresh
		time_lastUpdateUserList = 0;

		// wait a little moment then invoke djAdvance
		setTimeout(function() {
			djAdvanced(null);
		}, 1000);
	}

	/* Inject custom css styles for plugbot
	 */
	function injectCustomStyles() {
		// unselectable class
		injectStyles('.unselectable { \
						-moz-user-select: -moz-none; \
						-khtml-user-select: none; \
						-webkit-user-select: none; \
						-o-user-select: none; \
						user-select: none; \
					}');
	}

	/* Initialize timer to watch room joining
	 */
	function initWatchRoomJoin(callback) {
		var lastURL = '';

		var duration = 100;
		var interval_watchURLChange,
			interval_watchRoomJoin;
		var watchURLChange,
			watchRoomJoin;

		watchURLChange = function () {
			if (window.location.href != lastURL) {
				if ('' !== lastURL) {
					interval_watchRoomJoin = setInterval(watchRoomJoin, duration);
				}
				lastURL = window.location.href;
			}
		}

		watchRoomJoin = function() {
			if (0 !== API.getUsers().length) {
				callback();
				clearInterval(interval_watchRoomJoin);
			}
		}

		interval_watchURLChange = setInterval(watchURLChange, duration);
	}

	/* Update video orignal url
	 * \param	noDisplay		|	don't call displayUI()
	 */
	function updateVidURL(noDisplay) {
		var media = PlaybackModel.get('media');
		if ('undefined' === typeof(media)) { return; }
		var format = media.get('format');
		var id = media.get('cid');

		if ('1' === format) { // youtube
			vidURL = 'http://www.youtube.com/watch?v=' + id;
		} else if ('2' === format) { // soundcloud
			vidURL = 'http://www.soundcloud.com/';
		}

		if ( !noDisplay) {
			displayUI();
		}
	}

	/* Suppress alert box
	 */
	function suppressAlert() {
		window.alert = function(text) {
			console.log('ALERT: ' + text);
		}
	}

	/* Reset playback
	 */
	function resetPlayback() {
		PlaybackView.onRefreshClick();
	}

	/* Init webpage visibility watch
	 */
	function init_visWatch() {
		var hidden = "hidden";

		// Standards:
		if (hidden in document)
			document.addEventListener("visibilitychange", onchange);
		else if ((hidden = "mozHidden") in document)
			document.addEventListener("mozvisibilitychange", onchange);
		else if ((hidden = "webkitHidden") in document)
			document.addEventListener("webkitvisibilitychange", onchange);
		else if ((hidden = "msHidden") in document)
			document.addEventListener("msvisibilitychange", onchange);

		// IE 9 and lower:
		else if ('onfocusin' in document)
			document.onfocusin = document.onfocusout = onchange;

		// All others:
		else
			window.onfocus = window.onblur = onchange;

		function onchange(evt) {
			var isvis = true;
			evt = evt || window.event;

			if (evt.type == "focus" || evt.type == "focusin") {
				isvis = true;
			} else if (evt.type == "blur" || evt.type == "focusout") {
				isvis = false;
			} else {
				isvis = !this[hidden];
			}

			if (isvis) {
				onWindowFocus();
			} else {
				onWindowBlur();
			}
		}
	}

	/* When window is focused
	 */
	function onWindowFocus() {
		isWebVisible = true;
		populateUserlist();
	}

	/* When window is NOT focused
	 */
	function onWindowBlur() {
		isWebVisible = false;
	}
});

// ===== ### Public functions =====
/* Inject css styles
 */
function injectStyles(rule) {
	$('head').append('<style type="text/css">' + rule + '</style>');
}
