var stringSimilarity = require('string-similarity')

var sort = {}

/**
 * Stable sort, preserving original order.
 * @param {Array} arr - The array to sort.
 * @param {function} [fn] - A comparison function that returns
 * `-1` if the first argument scores less than the second argument,
 * `1` if the first argument scores more than the second argument,
 * and `0` if the scores are equal.
 * @return {Array} - A new array that is sorted.
 */
sort.stableSort = function (arr, fn) {
  fn = fn || sort.ascending()
  var i = 0
  var pair = function (x) {
    return {key: i++, val: x}
  }
  var key = function (x) {
    return x.key
  }
  var val = function (x) {
    return x.val
  }
  var cmp = sort.combine(function (a, b) {
    return fn(a.val, b.val)
  }, sort.ascending(key))
  var pairs = arr.map(pair)
  pairs = pairs.sort(cmp)
  arr = pairs.map(val)
  return arr
}

/**
 * Identity function.
 * @param {Object} x - A value.
 * @return {Object} - The same value.
 */
sort.identity = function (x) {
  return x
}

/**
 * Create an ascending comparison function.
 * @param {function} fn - A scoring function.
 * @return {function} - A comparison function that returns
 * `-1` if the first argument scores less than the second argument,
 * `1` if the first argument scores more than the second argument,
 * and `0` if the scores are equal.
 */
sort.ascending = function (fn) {
  fn = fn || sort.identity
  return function (a, b) {
    var x = fn(a)
    var y = fn(b)
    return (x < y) ? -1 : ((x > y) ? 1 : 0)
  }
}

/**
 * Create a descending comparison function.
 * @param {function} fn - A scoring function.
 * @return {function} - A comparison function that returns
 * `-1` if the first argument scores more than the second argument,
 * `1` if the first argument scores less than the second argument,
 * and `0` if the scores are equal.
 */
sort.descending = function (fn) {
  fn = fn || sort.identity
  return function (a, b) {
    var x = fn(a)
    var y = fn(b)
    return (x < y) ? 1 : ((x > y) ? -1 : 0)
  }
}

/**
 * Combine comparison functions.
 * @param {...function} fn - A comparison function.
 * @return {function} - A combined comparison function that returns
 * the first comparison value unless the comparands are equal,
 * in which case it returns the next value.
 */
sort.combine = function () {
  var args = Array.prototype.slice.call(arguments)
  var callback = function (fn1, fn2) {
    return function (a, b) {
      var val = fn1(a, b)
      return (val === 0) ? fn2(a, b) : val
    }
  }
  return args.reduce(callback)
}

/**
 * Compare tracks by Last.fm rating.
 * @param {Track} a - A track.
 * @param {Track} b - A track.
 * @return {integer} - `1` if `a` is less than `b`,
 * `-1` if `a` is greater than `b`,
 * and `0` if `a` is equal to `b`.
 */
sort.lastfm = sort.descending(function (x) {
  return x.lastfm()
})

/**
 * Compare tracks by Spotify popularity.
 * @param {Track} a - A track.
 * @param {Track} b - A track.
 * @return {integer} - `1` if `a` is less than `b`,
 * `-1` if `a` is greater than `b`,
 * and `0` if `a` is equal to `b`.
 */
sort.popularity = sort.descending(function (x) {
  if (typeof x.popularity === 'function') {
    return x.popularity()
  } else {
    return x.popularity || -1
  }
})

/**
 * Compare albums by type. Proper albums are ranked highest,
 * followed by singles, guest albums, and compilation albums.
 * @param {JSON} a - An album.
 * @param {JSON} b - An album.
 * @return {integer} - `-1` if `a` is less than `b`,
 * `1` if `a` is greater than `b`,
 * and `0` if `a` is equal to `b`.
 */
sort.type = sort.descending(function (album) {
  var rankings = {
    'album': 4,
    'single': 3,
    'appears_on': 2,
    'compilation': 1
  }
  var type = album.album_type || album.type()
  return rankings[type] || 0
})

/**
 * Compare albums by type and popularity.
 * @param {JSON} a - An album.
 * @param {JSON} b - An album.
 * @return {integer} - `-1` if `a` is less than `b`,
 * `1` if `a` is greater than `b`,
 * and `0` if `a` is equal to `b`.
 */
sort.album = sort.combine(sort.type, sort.popularity)

/**
 * Sort track objects by similarity to a track.
 * @param {string} track - The track to compare against.
 * @return {function} - A comparison function.
 */
sort.similarity = function (track) {
  return sort.descending(function (x) {
    var title = x.name + ' - ' + (x.artists[0].name || '')
    return stringSimilarity.compareTwoStrings(title, track)
  })
}

/**
 * Sort track objects by censorship.
 * Explicit tracks are preferred over censored ones.
 * @param {Track} a - A track.
 * @param {Track} b - A track.
 * @return {integer} - `1` if `a` is less than `b`,
 * `-1` if `a` is greater than `b`,
 * and `0` if `a` is equal to `b`.
 */
sort.censorship = sort.descending(function (x) {
  return x.explicit ? 1 : 0
})

/**
 * Sort track objects by similarity to a track,
 * popularity, and censorship.
 * @param {string} track - The track to compare against.
 * @return {function} - A comparison function.
 */
sort.track = function (track) {
  return sort.combine(sort.similarity(track),
                      sort.popularity,
                      sort.censorship)
}

module.exports = sort