var http = require('http');
var _ = require('lodash'),
    request = require('request');

module.exports = function (option) {
  option = option || {};
  var base = option.base || 'https://api.mailgun.net/v2/',
      domain = option.domain,
      username = option.username || 'api',
      password = option.password,
      debug = option.debug || false;

  if (!domain) {
    throw new Error('Missing email domain name');
  }

  if (!password) {
    throw new Error('Missing API key');
  }

  var endpoint = base + domain + '/messages';

  function send (mail, callback) {
    var data = _.pick(mail.data,
                      ['from', 'to', 'cc', 'bcc',
                       'subject', 'text', 'html']);

    if (mail.data.replyTo) {
      data['h:Reply-To'] = mail.data.replyTo;
    }

    if (mail.data.headers) {
      _.forOwn(mail.data.headers, function (value, key, object) {
        data['h:' + key] = value;
      });
    }

    if (mail.data.mailgun) {
      if (mail.data.mailgun.o) {
        _.forOwn(mail.data.mailgun.o, function (value, key, object) {
          data['o:' + key] = value;
        });
      }

      if (mail.data.mailgun.v) {
        _.forOwn(mail.data.mailgun.v, function (value, key, object) {
          data['v:' + key] = value;
        });
      }

      if (mail.data.mailgun.rv) {
        try {
          data['recipient-variables'] = JSON.stringify(mail.data.mailgun.rv);
        } catch (err) {
          callback(err);
        }
      }
    }

    if (debug) {
      console.log(data);
    }

    request.post(endpoint, handler)
      .form(data)
      .auth(username, password, true);

    function handler (err, res, body) {
      var info = {};
      if (err) {
        callback(err);
      } else if (res.statusCode != 200) {
        callback(new Error(res.statusCode + ' ' +
                           http.STATUS_CODES[res.statusCode]));
      } else {
        try {
          info = JSON.parse(body);
        } catch (e) {
          callback(e);
        }
        info.messageId = (info.id || '').replace(/(^<)|(>$)/g, '');
        callback(null, info);
      }
    }

  }

  return {
    name: 'Mailgun',
    version: require('../package.json').version,
    send: send
  };
};
