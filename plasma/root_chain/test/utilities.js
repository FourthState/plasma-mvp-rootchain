/* 
 How to avoid using try/catch blocks with promises' that could fail using async/await
 - https://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
 */

let to = function(promise) {
  return promise.then(result => [null, result])
      .catch(err => [err]);
}

module.exports = {
    to: to
}
