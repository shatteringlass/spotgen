#!/usr/bin/env node

/* eslint-disable no-unused-vars */
var async = require('async')
var fs = require('fs')
var request = require('request')

var defaults = require('./defaults')
var lastfm = require('./lastfm')(defaults.api)

var spotify = {}

/**
 * Represents a playlist.
 * @constructor
 * @param {string} str - The playlist as a string.
 */
spotify.Playlist = function (str) {
  /**
   * Self reference.
   */
  var self = this

  /**
   * Playlist order.
   */
  this.ordering = null

  /**
   * Playlist grouping.
   */
  this.grouping = true

  /**
   * Unique flag.
   */
  this.unique = true

  /**
   * List of entries.
   */
  this.entries = new spotify.Queue()

  str = str.trim()
  if (str !== '') {
    var lines = str.split(/\r|\n|\r\n/)
    while (lines.length > 0) {
      var line = lines.shift()
      if (line.match(/^#ORDER BY POPULARITY/i)) {
        this.ordering = 'popularity'
      } else if (line.match(/^#ORDER BY LAST.?FM/i)) {
        this.ordering = 'lastfm'
      } else if (line.match(/^#GROUP BY ENTRY/i)) {
        this.grouping = 'entry'
      } else if (line.match(/^#GROUP BY ARTIST/i)) {
        this.grouping = 'artist'
      } else if (line.match(/^#GROUP BY ALBUM/i)) {
        this.grouping = 'album'
      } else if (line.match(/^#UNIQUE/i)) {
        this.unique = true
      } else if (line.match(/^#ALBUM /i)) {
        var album = new spotify.Album(line.substring(7))
        this.entries.add(album)
      } else if (line.match(/^#ARTIST /i)) {
        var artist = new spotify.Artist(line.substring(8))
        this.entries.add(artist)
      } else if (line !== '') {
        var track = new spotify.Track(line)
        this.entries.add(track)
      }
    }
  }

  /**
   * Dispatch all the entries in the playlist
   * and return the track listing.
   * @return {Queue} A list of results.
   */
  this.dispatch = function () {
    return self.fetchTracks()
      .then(self.dedup)
      .then(self.order)
      .then(self.group)
      .then(self.toString)
  }

  /**
   * Dispatch the entries in the playlist.
   */
  this.fetchTracks = function () {
    return self.entries.dispatch().then(function (result) {
      self.entries = result.flatten()
      return self
    })
  }

  /**
   * Refresh the entries in the playlist.
   */
  this.refreshTracks = function () {
    return self.entries.dispatch().then(function (result) {
      self.entries = result.flatten()
      return self
    })
  }

  /**
   * Fetch Last.fm information.
   */
  this.fetchLastfm = function () {
    return self.entries.resolveAll(function (entry) {
      return entry.fetchLastfm()
    }).then(function (result) {
      return self
    })
  }

  /**
   * Remove duplicates.
   */
  this.dedup = function () {
    if (self.unique) {
      self.entries.dedup()
    }
  }

  this.order = function () {
    if (self.ordering === 'popularity') {
      return self.refreshTracks()
        .then(self.orderByPopularity)
    } else if (self.ordering === 'lastfm') {
      return self.fetchLastfm()
        .then(self.orderByLastfm)
    }
  }

  this.orderByPopularity = function () {
    self.entries.sort(function (a, b) {
      var x = a.popularity()
      var y = b.popularity()
      var val = (x < y) ? 1 : ((x > y) ? -1 : 0)
      return val
    })
  }

  this.orderByLastfm = function () {
    self.entries.sort(function (a, b) {
      var x = a.lastfm()
      var y = b.lastfm()
      var val = (x < y) ? 1 : ((x > y) ? -1 : 0)
      return val
    })
  }

  this.groupByArtist = function () {
    self.entries.group(function (track) {
      return track.artist()
    })
  }

  this.groupByAlbum = function () {
    self.entries.group(function (track) {
      return track.album()
    })
  }

  this.groupByEntry = function () {
    self.entries.group(function (track) {
      return track.entry
    })
  }

  this.group = function () {
    if (self.grouping === 'artist') {
      return self.groupByArtist()
    } else if (self.grouping === 'album') {
      return self.refreshTracks()
        .then(self.groupByAlbum)
    } else if (self.grouping === 'entry') {
      return self.groupByEntry()
    }
  }

  /**
   * Convert the playlist to a string.
   * @return {string} A newline-separated list of Spotify URIs.
   */
  this.toString = function () {
    var result = ''
    self.entries.forEach(function (track) {
      console.log(track.toString())
      console.log(track.lastfm())
      var uri = track.uri()
      if (uri !== '') {
        result += uri + '\n'
      }
    })
    return result.trim()
  }

  /**
   * Print the playlist to the console.
   */
  this.print = function () {
    console.log(self.toString())
  }
}

/**
 * Queue of playlist entries.
 * @constructor
 */
spotify.Queue = function () {
  /**
   * Self reference.
   */
  var self = this

  /**
   * Array of entries.
   */
  this.queue = []

  /**
   * Add an entry.
   */
  this.add = function (entry) {
    self.queue.push(entry)
  }

  /**
   * Get an entry.
   */
  this.get = function (idx) {
    return self.queue[idx]
  }

  /**
   * The number of entries.
   */
  this.size = function () {
    return self.queue.length
  }

  /**
   * Iterate over the queue.
   */
  this.forEach = function (fn) {
    return self.queue.forEach(fn)
  }

  /**
   * Map a function over the queue.
   */
  this.map = function (fn) {
    var result = new spotify.Queue()
    self.forEach(function (entry) {
      result.add(fn(entry))
    })
    return result
  }

  /**
   * Concatenate two queues.
   */
  this.concat = function (queue) {
    var result = new spotify.Queue()
    result.queue = self.queue
    result.queue = result.queue.concat(queue.queue)
    return result
  }

  /**
   * Sort the queue.
   */
  this.sort = function (fn) {
    self.queue = self.queue.sort(fn)
    return self
  }

  /**
   * Whether the queue contains an entry.
   */
  this.contains = function (obj) {
    for (var i in self.queue) {
      var entry = self.queue[i]
      if ((entry.equals && entry.equals(obj)) ||
          entry === obj) {
        return true
      }
    }
    return false
  }

  /**
   * Remove duplicate entries.
   */
  this.dedup = function () {
    var result = new spotify.Queue()
    self.queue.forEach(function (entry) {
      if (!result.contains(entry)) {
        result.add(entry)
      }
    })
    self.queue = result.queue
    return self
  }

  /**
   * Group entries.
   */
  this.group = function (fn) {
    var map = []
    var result = []
    for (var i in self.queue) {
      var entry = self.queue[i]
      var key = fn(entry)

      if (!map[key]) {
        map[key] = []
      }
      map[key].push(entry)
    }
    for (var k in map) {
      result = result.concat(map[k])
    }
    self.queue = result
    return self
  }

  /**
   * Flatten a queue of queues into a single queue.
   */
  this.flatten = function () {
    var result = []
    for (var i in self.queue) {
      var entry = self.queue[i]
      if (entry instanceof spotify.Queue) {
        entry = entry.flatten()
        result = result.concat(entry.queue)
      } else {
        result.push(entry)
      }
    }
    self.queue = result
    return self
  }

  /**
   * Dispatch all entries in order.
   * @return {Queue} A list of results.
   */
  this.resolveAll = function (fn) {
    // we could have used Promise.all(), but we choose to roll our
    // own, sequential implementation to avoid overloading the server
    var result = new spotify.Queue()
    var ready = Promise.resolve(null)
    self.queue.forEach(function (entry) {
      ready = ready.then(function () {
        return fn(entry)
      }).then(function (value) {
        result.add(value)
      })
    })
    return ready.then(function () {
      return result
    })
  }

  /**
   * Dispatch all entries in order.
   * @return {Queue} A list of results.
   */
  this.dispatch = function () {
    return self.resolveAll(function (entry) {
      return entry.dispatch()
    })
  }
}

/**
 * Track entry.
 * @constructor
 * @param {string} entry - The track to search for.
 * @param {JSON} [response] - Track response object.
 * Should have the property `uri`.
 * @param {JSON} [responseSimple] - Simplified track response object.
 */
spotify.Track = function (entry, response) {
  /**
   * Self reference.
   */
  var self = this

  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Simplified track object.
   */
  this.responseSimple = null

  /**
   * Full track object.
   */
  this.response = null

  /**
   * Track ID.
   */
  this.id = function () {
    if (self.response &&
        self.response.id) {
      return self.response.id
    } else if (self.responseSimple &&
               self.responseSimple.id) {
      return self.responseSimple.id
    } else if (self.isURI(self.entry)) {
      return self.entry.substring(14)
    } else if (self.isLink(self.entry)) {
      return self.entry.substring(30)
    } else {
      return -1
    }
  }

  /**
   * Whether a string is a Spotify URI.
   */
  this.isURI = function (str) {
    return str.match(/^spotify:track:/i)
  }

  /**
   * Whether a string is a Spotify link.
   */
  this.isLink = function (str) {
    return str.match(/^https?:\/\/open\.spotify\.com\/track\//i)
  }

  /**
   * Whether a track object is full or simplified.
   * A full object includes information (like popularity)
   * that a simplified object does not.
   */
  this.isFullResponse = function (response) {
    return response && response.popularity
  }

  if (self.isFullResponse(response)) {
    self.response = response
  } else {
    self.responseSimple = response
  }

  /**
   * Dispatch entry.
   * @return {Promise | URI} The track info.
   */
  this.dispatch = function () {
    if (self.response) {
      return Promise.resolve(self)
    } else if (self.responseSimple) {
      return self.fetchTrack()
    } else if (self.isURI(self.entry)) {
      return self.fetchTrack()
    } else {
      return self.searchForTrack(self.entry)
    }
  }

  /**
   * Fetch track.
   * @param {JSON} responseSimple - A simplified track response.
   * @return {Promise | Track} A track with
   * a full track response.
   */
  this.fetchTrack = function () {
    var id = self.id()
    var url = 'https://api.spotify.com/v1/tracks/'
    url += encodeURIComponent(id)
    return spotify.request(url).then(function (result) {
      self.response = result
      return self
    })
  }

  /**
   * Search for track.
   * @param {string} query - The query text.
   * @return {Promise | Track} A track with
   * a simplified track response.
   */
  this.searchForTrack = function (query) {
    // https://developer.spotify.com/web-api/search-item/
    var url = 'https://api.spotify.com/v1/search?type=track&q='
    url += encodeURIComponent(query)
    return spotify.request(url).then(function (result) {
      if (result.tracks &&
          result.tracks.items[0] &&
          result.tracks.items[0].uri) {
        self.responseSimple = result.tracks.items[0]
        return self
      }
    })
  }

  /**
   * Fetch Last.fm information.
   */
  this.fetchLastfm = function () {
    var artist = self.artist()
    var title = self.title()
    return lastfm.getInfo(artist, title).then(function (result) {
      self.lastfmResponse = result
      return self
    })
  }

  /**
   * Last.fm rating.
   * @return {Integer} The playcount, or -1 if not available.
   */
  this.lastfm = function () {
    if (self.lastfmResponse) {
      return parseInt(self.lastfmResponse.track.playcount)
    } else {
      return -1
    }
  }

  /**
   * Spotify URI.
   * @return {string} The Spotify URI
   * (a string on the form `spotify:track:xxxxxxxxxxxxxxxxxxxxxx`),
   * or the empty string if not available.
   */
  this.uri = function () {
    if (self.response) {
      return self.response.uri
    } else if (self.responseSimple) {
      return self.responseSimple.uri
    } else {
      return ''
    }
  }

  /**
   * Spotify popularity.
   * @return {int} The Spotify popularity, or -1 if not available.
   */
  this.popularity = function () {
    if (self.response) {
      return self.response.popularity
    } else {
      return -1
    }
  }

  /**
   * Track main artist.
   * @return {string} The main artist.
   */
  this.artist = function () {
    var artists = []
    var response = self.response || self.responseSimple
    if (response &&
        response.artists &&
        response.artists[0] &&
        response.artists[0].name) {
      return response.artists[0].name.trim()
    } else {
      return ''
    }
  }

  /**
   * Track artists.
   * @return {string} All the track artists, separated by `, `.
   */
  this.artists = function () {
    var artists = []
    var response = self.response || self.responseSimple
    if (response &&
        response.artists) {
      artists = self.response.artists.map(function (artist) {
        return artist.name.trim()
      })
    }
    return artists.join(', ')
  }

  /**
   * Track title.
   * @return {string} The track title.
   */
  this.title = function () {
    var response = self.response || self.responseSimple
    if (response &&
        response.name) {
      return response.name
    } else {
      return ''
    }
  }

  /**
   * Track album.
   * @return {string} The track album,
   * or the empty string if not available.
   */
  this.album = function () {
    if (self.response &&
        self.response.album &&
        self.response.album.name) {
      return self.response.album.name
    } else {
      return ''
    }
  }

  /**
   * Full track name.
   * @return {string} The track name, on the form `Title - Artist`.
   */
  this.name = function () {
    var title = self.title()
    if (title !== '') {
      var artist = self.artist()
      if (artist !== '') {
        return title + ' - ' + artist
      } else {
        return title
      }
    } else {
      return ''
    }
  }

  /**
   * Whether this track is identical to another track.
   */
  this.equals = function (track) {
    var str1 = self.toString().toLowerCase()
    var str2 = track.toString().toLowerCase()
    return str1 === str2
  }

  /**
   * Full track title.
   * @return {string} The track title, on the form `Title - Artist`.
   */
  this.toString = function () {
    var name = self.name()
    if (name !== '') {
      return name
    } else {
      return self.entry
    }
  }
}

/**
 * Album entry.
 * @constructor
 * @param {string} entry - The album to search for.
 */
spotify.Album = function (entry, response) {
  /**
   * Self reference.
   */
  var self = this

  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Album ID.
   */
  this.id = function () {
    if (self.albumResponse &&
        self.albumResponse.id) {
      return self.albumResponse.id
    } else if (self.searchResponse &&
               self.searchResponse.albums &&
               self.searchResponse.albums.items &&
               self.searchResponse.albums.items[0] &&
               self.searchResponse.albums.items[0].id) {
      return self.searchResponse.albums.items[0].id
    } else {
      return -1
    }
  }

  /**
   * Dispatch entry.
   * @return {Promise | Queue} The track list.
   */
  this.dispatch = function () {
    if (self.searchResponse) {
      return self.fetchAlbum()
        .then(self.createQueue)
    } else if (self.albumResponse) {
      return self.fetchAlbum()
        .then(self.createQueue)
    } else {
      return self.searchForAlbum(self.entry)
        .then(self.fetchAlbum)
        .then(self.createQueue)
    }
  }

  /**
   * Search for album.
   * @param {string} query - The query text.
   * @return {Promise | JSON} A JSON response.
   */
  this.searchForAlbum = function (query) {
    // https://developer.spotify.com/web-api/search-item/
    var url = 'https://api.spotify.com/v1/search?type=album&q='
    url += encodeURIComponent(query)
    return spotify.request(url).then(function (response) {
      if (self.isSearchResponse(response)) {
        self.searchResponse = response
        return Promise.resolve(response)
      } else {
        return Promise.reject(response)
      }
    })
  }

  this.fetchAlbum = function () {
    var id = self.id()
    var url = 'https://api.spotify.com/v1/albums/'
    url += encodeURIComponent(id)
    return spotify.request(url).then(function (response) {
      if (self.isAlbumResponse(response)) {
        this.albumResponse = response
        return Promise.resolve(response)
      } else {
        return Promise.reject(response)
      }
    })
  }

  this.createQueue = function (response) {
    var tracks = response.tracks.items
    var queue = new spotify.Queue()
    for (var i in tracks) {
      var entry = new spotify.Track(self.entry, tracks[i])
      queue.add(entry)
    }
    return queue
  }

  this.isSearchResponse = function (response) {
    return response &&
      response.albums &&
      response.albums.items[0] &&
      response.albums.items[0].id
  }

  this.isAlbumResponse = function (response) {
    return response &&
      response.id
  }

  if (self.isSearchResponse(response)) {
    self.searchResponse = response
  } else if (self.isAlbumResponse(response)) {
    self.albumResponse = response
  }
}

/**
 * Artist entry.
 * @constructor
 * @param {string} entry - The artist to search for.
 */
spotify.Artist = function (entry) {
  /**
   * Self reference.
   */
  var self = this

  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Search response.
   */
  this.artistResponse = null

  /**
   * Artist ID.
   */
  this.id = function () {
    if (self.artistResponse &&
        self.artistResponse.artists &&
        self.artistResponse.artists.items[0] &&
        self.artistResponse.artists.items[0].id) {
      return self.artistResponse.artists.items[0].id
    } else {
      return -1
    }
  }

  /**
   * Dispatch entry.
   * @return {Promise | URI} The artist info.
   */
  this.dispatch = function () {
    return self.searchForArtist(self.entry)
      .then(self.fetchAlbums)
      .then(self.createQueue)
  }

  /**
   * Search for artist.
   * @param {string} query - The query text.
   * @return {Promise | JSON} A JSON response.
   */
  this.searchForArtist = function (query) {
    // https://developer.spotify.com/web-api/search-item/
    var url = 'https://api.spotify.com/v1/search?type=artist&q='
    url += encodeURIComponent(query)
    return spotify.request(url).then(function (response) {
      if (self.isSearchResponse(response)) {
        self.artistResponse = response
        return Promise.resolve(response)
      } else {
        return Promise.reject(response)
      }
    })
  }

  this.fetchAlbums = function () {
    var id = self.id()
    var url = 'https://api.spotify.com/v1/artists/'
    url += encodeURIComponent(id) + '/albums'
    return spotify.request(url).then(function (response) {
      if (response.items) {
        this.albumResponse = response
        return Promise.resolve(response)
      } else {
        return Promise.reject(response)
      }
    })
  }

  this.createQueue = function (response) {
    var albums = response.items
    var queue = new spotify.Queue()
    for (var i in albums) {
      var entry = new spotify.Album(self.entry, albums[i])
      queue.add(entry)
    }
    return queue.dispatch()
  }

  this.isSearchResponse = function (response) {
    return response &&
      response.artists &&
      response.artists.items[0] &&
      response.artists.items[0].id
  }
}

/**
 * Perform a Spotify request.
 * @param {string} url - The URL to look up.
 */
spotify.request = function (url) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      console.log(url)
      request(url, function (err, response, body) {
        if (err) {
          reject(err)
        } else if (response.statusCode !== 200) {
          reject(response.statusCode)
        } else {
          try {
            body = JSON.parse(body)
          } catch (e) {
            reject(e)
          }
          if (body.error) {
            reject(body)
          } else {
            resolve(body)
          }
        }
      })
    }, 100)
  })
}

function main () {
  var input = process.argv[2] || 'input.txt'
  var output = process.argv[3] || 'output.txt'

  var str = fs.readFileSync(input, 'utf8').toString()
  var playlist = new spotify.Playlist(str)

  playlist.dispatch().then(function (str) {
    fs.writeFile(output, str, function (err) {
      if (err) { return }
      console.log('Wrote to ' + output)
    })
  })
}

if (require.main === module) {
  main()
}

module.exports = spotify

/*
Food for thought ...

Use prototype property for defining methods

Implement merging algorithm from last.py

Add support for spotify HTTP links
*/
