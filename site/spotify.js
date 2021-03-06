`use strict`

var fs 			= require('fs');
var queryString 	= require('querystring');
var cookieParser 	= require('cookie-parser');
var request		= require('request');

exports.client_id = '';
exports.client_secret = '';

/**
 * Get Spotify client id and secret
 * Checks environment variables SPOTIFY_ID and SPOTIFY_SECRET first, then falls back on .spotify file
 * Values get cached into client_id and client_secret
 *
 * @return {array} An array with the client id at index 0 and client secret at index 1
 */
exports.info = function() {
	if(process.env.SPOTIFY_ID && process.env.SPOTIFY_SECRET) {
		this.client_id = process.env.SPOTIFY_ID;
		this.client_secret = process.env.SPOTIFY_SECRET;
		return [this.client_id, this.client_secret];
	}

	var data = fs.readFileSync('./.spotify', 'utf-8');
	var res = data.split('\n');

	this.client_id = res[0];
	this.client_secret = res[1];
	return res;
}

this.info();
console.log('received values for client_id and client_secret');
console.log('client id value ' + this.client_id);

var redirect_uri = 'INVALID';

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

/**
 * Used to initialize the module
 *
 * Sets the redirect_uri to the desired page
 * @param  {string} callback The desired redirect uri
 */
exports.init = function(callback) {
	redirect_uri = callback;
	console.log('set redirect page to ' + redirect_uri);
}

/**
 * First step to get Spotify auth
 * Called when users GET request /login
 *
 * Returns login page with requested scope
 * @param  {string}   scope    Request authorization from Spotify
 * @param  {function} callback The function to call when completed, takes link and state
 * @return {string}   The generated spotify authorize link
 */
exports.auth = function(scope, callback) { 
	console.log('requesting scope access: ' + scope);
	var state = generateRandomString(16);

	console.log(redirect_uri);
	callback('https://accounts.spotify.com/authorize?' +
		queryString.stringify({
			response_type: 'code',
			client_id: this.client_id,
			scope: scope,
			redirect_uri: redirect_uri,
			state: state
		}),
		state);
}

/**
 * Second step to get Spotify auth
 * Called after Spotify redirects to /callback
 *
 * Returns the access and refresh tokens in an array if successful
 * @param  {string}   code     Received code from Spotify
 * @param  {function} callback Callback function, takes the access and refresh tokens
 * @return {array} Access and Refresh tokens if successful, 'Error' and Error url if not
 */
exports.request = function(code, callback) {
	var authOptions = {
		url: 'https://accounts.spotify.com/api/token',
		form: {
			code: code,
			redirect_uri: redirect_uri,
			grant_type: 'authorization_code'
		},
		headers: {
			'Authorization': 'Basic ' + (new Buffer(this.client_id + ':' + this.client_secret).toString('base64'))
		},
		json: true
	};

	console.log('sending post request to https://accounts.spotify.com/api/token');
	request.post(authOptions, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			console.log('received access tokens, redirecting');
			callback(false, body.access_token, body.refresh_token);
		} else {
			console.log('error: ' + error);
			callback(true, error, response.statusCode);
		}
	});
}

/**
 * After getting spotify auth, we can make calls to Spotify API
 * this returns a list of recommendations based on the params
 *
 * Returns something
 * @param  {object} attr     Desired attributes
 * @param  {string} access   The access key
 * @param  {func}   callback Function to call with the result of the request
 */
exports.recommendations = function(attr, tracks, access, callback) {
	this.get('https://api.spotify.com/v1/recommendations?' +
			queryString.stringify(attr) + '&seed_tracks=' + tracks, access, callback);
}

/**
 * Search for tracks on Spotify
 *
 * Returns the json body of found tracks
 * @param  {string} query    The search query
 * @param  {string} access   The access key
 * @param  {func}   callback The function to call with the track data 
 */
exports.search = function(query, access, callback) {
	this.get('https://api.spotify.com/v1/search?' +
			queryString.stringify({
				q: query,
				type: 'track',
				limit: 10
			}), access, function(body) {
				if(body && body.tracks && body.tracks.items) {
					callback(body.tracks.items);
				} else {
					console.log(body);
					callback({error: 'error'});
				}
			});
}

/**
 * Get the current user's Spotify profile
 * 
 * @param {string} access   The access key
 * @param {func}   callback The function to call with user data
 */
exports.profile = function(access, callback) {
	this.get('https://api.spotify.com/v1/me', access, function(body) {
		callback(body);
	});
}

/**
 * Given a set of tracks, create a playlist
 *
 * @param {string} access   The access keey
 * @param {array}  tracks   The set of Spotify URIs
 * @param {func}   callback Function to call after creating the playlist
 */
exports.create = function(access, tracks, callback) {
	this.profile(access, function(body) {
		var id = body.id;
		var url = 'https://api.spotify.com/v1/users/' + id + '/playlists';
		var authOptions = {
			url: url,
			headers: {
				'Authorization': 'Bearer ' + access,
				'Content-Type': 'application/json' 
			},
			json: {
				name: 'Melofy Playlist!',
				description: 'A playlist generated for you by the lads over at Melofy! Create more at melofy.cleverapps.io!'
			}
		};
		
		console.log('sending post request to create playlist, url ' + url);
		request.post(authOptions, function(error, response, body) {
			if(!error && (response.statusCode === 200 || response.statusCode === 201)) {
				console.log('successfully created playlist, id ' + body.id);
				var uri = body.uri;
				console.log(uri);
				var playlist_url = 'https://api.spotify.com/v1/playlists/' + body.id + '/tracks';
				var playlist_options = {
					url: playlist_url,
					headers: {
						'Authorization': 'Bearer ' + access,
						'Content-Type': 'application/json'
					},
					json: {
						uris: tracks
					}
				};


				request.post(playlist_options, function(error, response, body) {
					if(response.statusCode === 201) {
						console.log('successfully created playlist, sending back ' + uri);
						callback(uri);
					} else {
						callback('./error');
					}
				});
			} else {
				console.log(body)
				console.log(response.statusCode);
			}
		});
	});
}

/**
 * Makes a request to Spotify's API given a constructed object
 *
 * Returns the json body of the request
 * @param  {object} url      The spotify url
 * @param  {string} access   The access token
 * @param  {func}   callback The function to call after getting the data
 */
exports.get = function(url, access, callback) {
	if(!access) {
		console.log('invalid access token, user needs to login first')
		callback({error: 'invalid access token'});
		return -1;
	}

	console.log('making request to spotify url ' + url);
	var options = {
		url: url,
		headers: {
			'Authorization': 'Bearer ' + access
		},
		json: true
	};

	request.get(options, function(error, response, body) {
		if(error || (body && body.error && body.error.status)) {
			console.log('error generating playlist')
			callback(body);
			return -1;
		}

		if(response.statusCode === 200 || response.statusCode === 201){
			console.log('received response');
			console.log(body);

			callback(body);
		}
	});
}
