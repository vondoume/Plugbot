var enabled = "enabled"

setTimeout(function(){ log('WootBot now' + enabled.fontcolor('lightgreen') + '. Version 1.0') },1000);

var autowoot;
var hideVideo;
var userList;
var MAX_USERS_WAITLIST = 50;

function initAPIListeners() 
{
    API.on(API.DJ_ADVANCE, djAdvanced);
    API.on(API.WAIT_LIST_UPDATE, queueUpdate);
    API.on(API.DJ_UPDATE, queueUpdate);
    API.on(API.VOTE_UPDATE, function (obj) 
	{
        populateUserlist();
    });
    
    API.on(API.USER_JOIN, function (user) 
	{
        populateUserlist();
    });
    
    API.on(API.USER_LEAVE, function (user) 
	{
        populateUserlist();
    });
}

function djAdvanced(obj) 
{
    document.location.reload()
}
function populateUserlist() 
{
    $('#plugbot-userlist').html(' ');

    $('#plugbot-userlist').append('<h1 style="text-indent:12px;color:#42A5DC;font-size:14px;font-variant:small-caps;">Users: ' + API.getUsers().length + '</h1>');

    $('#plugbot-userlist').append('<p style="padding-left:12px;text-indent:0px !important;font-style:italic;color:#42A5DC;font-size:11px;">Click a username to<br />@mention them! *NEW</p><br />');

    if ($('#button-dj-waitlist-view').attr('title') !== '') 
	{
        if ($('#button-dj-waitlist-leave').css('display') === 'block' && ($.inArray(API.getDJs(), API.getSelf()) == -1)) {
            var spot = $('#button-dj-waitlist-view').attr('title').split('(')[1];
            spot = spot.substring(0, spot.indexOf(')'));
            $('#plugbot-userlist').append('<h1 id="plugbot-queuespot"><span style="font-variant:small-caps">Waitlist:</span> ' + spot + '</h3><br />');
        }
    }

    var users = new Array();

    for (user in API.getUsers()) 
	{
        users.push(API.getUsers()[user]);
    }

    for (user in users) 
	{
        var user = users[user];
        appendUser(user);
    }
}
function appendUser(user) 
{
    var username = user.username;
    var permission = user.permission;

    if (user.admin) 
	{
        permission = 99;
    }

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
        case 99:
            imagePrefix = 'admin';
            break;
    }

    if (API.getDJs()[0].username == username) 
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
        drawUserlistItem('void', colorByVote(user.vote), username);
    } 
	else 
	{
        drawUserlistItem(imagePrefix + imagePrefixByVote(user.vote), colorByVote(user.vote), username);
    }
}
function colorByVote(vote) 
{
    if (!vote) 
	{
        return '#fff';
    }
    switch (vote) 
	{
        case -1:
            return '#c8303d';
        case 0:
            return '#fff';
        case 1:
            return '#c2e320';
    }
}
function imagePrefixByVote(vote) 
{
    if (!vote) 
	{
        return '_undecided.png';
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
function drawUserlistItem(imagePath, color, username) 
{
    if (imagePath !== 'void') 
	{
        var realPath = 'http://www.theedmbasement.com/basebot/userlist/' + imagePath;
        $('#plugbot-userlist').append('<img src="' + realPath + '" align="left" style="margin-left:6px;margin-top:2px" />');
    }

    $('#plugbot-userlist').append(
        '<p style="cursor:pointer;' + (imagePath === 'void' ? '' : 'text-indent:6px !important;') + 'color:' + color + ';' + ((API.getDJs()[0].username == username) ? 'font-size:15px;font-weight:bold;' : '') + '" onclick="$(\'#chat-input-field\').val($(\'#chat-input-field\').val() + \'@' + username + ' \').focus();">' + username + '</p>');
}
$('#plugbot-userlist').remove();
$('#plugbot-css').remove();
$('#plugbot-js').remove();
$('body').prepend('<style type="text/css" id="plugbot-css">#plugbot-ui { position: absolute; margin-left: 349px; }#plugbot-ui p { background-color: #0b0b0b; height: 32px; padding-top: 8px; padding-left: 8px; padding-right: 6px; cursor: pointer; font-variant: small-caps; width: 84px; font-size: 15px; margin: 0; }#plugbot-ui h2 { background-color: #0b0b0b; height: 112px; width: 156px; margin: 0; color: #fff; font-size: 13px; font-variant: small-caps; padding: 8px 0 0 12px; border-top: 1px dotted #292929; }#plugbot-userlist { border: 6px solid rgba(10, 10, 10, 0.8); border-left: 0 !important; background-color: #000000; padding: 8px 0px 20px 0px; width: 12%; }#plugbot-userlist p { margin: 0; padding-top: 4px; text-indent: 24px; font-size: 10px; }#plugbot-userlist p:first-child { padding-top: 0px !important; }#plugbot-queuespot { color: #42A5DC; text-align: left; font-size: 15px; margin-left: 8px }');
$('body').append('<div id="plugbot-userlist"></div>');
$('#button-vote-positive').click();

populateUserlist();
initAPIListeners();
displayUI();
var soundOn = (0 != $('#slider > div').width());
if (soundOn) {
        $('#button-sound').click();
