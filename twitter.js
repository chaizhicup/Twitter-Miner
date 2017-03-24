// API: https://www.npmjs.com/package/twitter
const autolinker = require('text-autolinker')
const Twitter = require('twitter')
const moment = require('moment')
const fs = require('fs')


// Timing variables
// NOTE: May want a seprate timeout for killing streaming
// 	this way polling may continue on a limited subset instead of an ever increasing set
var pollInterval = 60 * 1000
var pollingWindow = 2 * 60 * 1000
var streamingWindow = 2 * 60 * 1000
var waitTime = 15 * 60 * 1001 //added 15 extra milliseconds just to be safe on the limit window
var location = ''

//Twitter API access info
const client = new Twitter({
	consumer_key: 'iCqI27Unu8I8z8X8ktqkqdekS',
	consumer_secret: 'w7TqSQfdHQnGaF1NZEWZO18ahW7gFArIXfjKLTNhQ4lPxqf4m8',
	access_token_key: '835131198108282880-RsY3sTnIiIUZMfSQfBap9BYFAqe5pLa',
	access_token_secret: 'R3kPEA1lyFwdjzFw3RtoFuF0US9fBmpD3g2x1Sb9ztwRD'
})

// TODO: Create another client to poll - maybe API will get angry though? :(

// Pull all statuses relating to specified keyword (track:'keyword')
// Streaming message types: https://dev.twitter.com/streaming/overview/messages-types
// https://dev.twitter.com/streaming/overview/request-parameters
// NOTE: For tracking comma function as logical OR while space functions as logical AND
// NOTE: Location requires bounding box Easy way to get bbox
//  1. Go to http://boundingbox.klokantech.com/
//  2. Set copy/paste to csv raw
const stream = client.stream('statuses/filter', {
	track: '@BeyondWland,#Beyond2017'
	//track: 'Beyond2017'
	//locations: '34.1083, -117.2898, 20mi' <- this should be the location for the festival
	// locations: ''
})

// Reference to example response
// https://dev.twitter.com/rest/reference/get/statuses/show/id
var data = []
stream.on('data', (tweet) => {
	//https://twitter.com/search?q=%23test&src=typd
	// Process collected data
	// NOTE: Using try-catch to handle errors near end of stream
	try {
		autolinker.parse(tweet, function(err,result){
			var text = result.html
			data.push({
				id: tweet.id,
				rt_overtime: [tweet.retweet_count],
				fav_overtime: [tweet.favorite_count],
				time: [tweet.timestamp_ms],
				user: tweet.user.screen_name,
				user_location: tweet.user.location,
				profile_pic: tweet.user.profile_image_url,
				followers: tweet.user.followers_count,
				following: tweet.user.friends_count,
				text: tweet.text,
				fixed_text: text,
				coordinates: tweet.coordinates,
				event_location: location
			})
		});
	} catch (e) {}
})

stream.on('error', (error) => {
	throw error
})

// Poll every X minute to update all tweets
// NOTE: Can't stream and poll?
var pollFunction = null
const poll = () => {

	var total = data.length
	var i, tempData, chunk = 180
	for(i = 0; i < total; i+=chunk){
		//slice array into sub arrays of size <= 180
		tempData = data.slice(i, i+chunk)
		console.log('Taking poll . . .')
		//pollHelper(i, i+(tempData.length - 1))
		pollFunction = setInterval(() => {
			console.log('Taking poll . . .')
			pollHelper(i, i+(tempData.length - 1))
		}, waitTime)
	}
}

// Recursive call to fix issues with async scope loss
const pollHelper = (current, total) => {
	client.get('statuses/lookup', { id: data[current].id }, (error, tweet) => {
		if (error) {
			console.log(error)
		} else {
			// NOTE: Find out if this maintains ordering else lookup is required
			// NOTE: Have to start time tracking these as well
			if (data[current].rt_overtime[data[current].rt_overtime.length - 1] !== tweet.retweet_count) {
				data[current].rt_overtime.push(tweet.retweet_count)
			}

			if (data[current].fav_overtime[data[current].fav_overtime.length - 1] !== tweet.favorite_count) {
				data[current].fav_overtime.push(tweet.favorite_count)
			}

			data[current].time.push(moment().milliseconds() - startMoment)
		}

		if (current < total - 1) pollHelper(current + 1, total)
	})
}

const output = () => {
	// Dump to file
	var json = JSON.stringify(data, null, 4)
	var filename = 'output_' + moment().format('YYYY-MM-DD_HH-mm') + '.json'
	fs.writeFile(filename, json, 'utf8', (error) => {
		if (error) throw error
		console.log('File saved as: ' + filename)
		process.exit()
	})
}

const endPolling = () => {
	console.log('Ending polling . . .')
	clearInterval(pollFunction)

	// Third: Write it all to file
	console.log('Writing to file . . .')
	output()
}

const endStreaming = () => {
	console.log('Ending streaming . . .')
	stream.destroy()

	// Second: Begin polling the end it
	console.log('Waiting 15 minutes to begin polling . . .')
	setTimeout(poll, waitTime)
	console.log('Starting polling . . .')
	setTimeout(poll, waitTime * 2.2)// this would fire off at the same time as the other call.
	console.log('Starting second poll . . .')

	setTimeout(endPolling, waitTime * (data.length/180))
}

// First: run stream then end it
var startMoment = moment().millisecond()
console.log('Starting streaming . . .')
setTimeout(endStreaming, streamingWindow)
