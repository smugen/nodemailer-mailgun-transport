var fs = require('fs'),
    http = require('http');
var _ = require('lodash'),
    request = require('request');

module.exports = function (option) {
  option = option || {};
  var base = option.base || 'https://api.mailgun.net/v2/',
      domain = option.domain,
      username = option.username || 'api',
      password = option.password,
      debug = option.debug || {};

  if (!domain) {
    throw new Error('Missing email domain name');
  }

  if (!password) {
    throw new Error('Missing API key');
  }

  var endpoint = base + domain + '/messages';

  function send (mail, callback) {
    var data =
      _.mapValues(_.pick(mail.data, ['from', 'to', 'cc', 'bcc']),
                  normalizeRecipients);

    function normalizeRecipients (rec) {
      return (_.isArray(rec)) ?
              _.map(rec, flattenAddrObj).join(', ') :
              flattenAddrObj(rec);

      function flattenAddrObj (addrObj) {
        if (!_.isString(addrObj) && addrObj.address) {
          if (addrObj.name) {
            return '"' + addrObj.name + '" ' +
                    '<' + addrObj.address + '>';
          } else {
            return addrObj.address;
          }
        } else {
          return addrObj;
        }
      }
    }

    if (mail.data.subject) { data.subject = mail.data.subject; }

    _.forOwn(_.pick(mail.data, ['text', 'html']),
            function (value, key, object) {
              if (value.path) {
                data[key] = fs.createReadStream(value.path);
              } else {
                data[key] = value;
              }
            });

    if (mail.data.replyTo) {
      data['h:Reply-To'] = normalizeRecipients(mail.data.replyTo);
    }

    if (mail.data.headers) {
      _.forOwn(mail.data.headers, function (value, key, object) {
        data['h:' + key] = value;
      });
    }

    if (mail.data.attachments) {
      data.attachment = _.map(mail.data.attachments, function (att) {
        var value, options = {};

        if (debug.attachment) {
          console.log(att);
        }

        if (!(value = att.content)) {
          if (att.href) {
            value = request(att.href);
          } else if (att.path) {
            value = fs.createReadStream(att.path);
          }
        } else if (value.path) {
          value = fs.createReadStream(value.path);
        }

        if (att.filename) {
          options.filename = att.filename;
        }

        if (att.cid) {
          options.cid = att.cid;
        }

        if (att.contentType) {
          options.contentType = att.contentType;
        }

        if (debug.attachment) {
          console.log({
            value: value,
            options: options
          });
        }

        return {
          value: value,
          options: options
        };
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
          try {
            data['v:' + key] = JSON.stringify(value);
          } catch (err) {
            return callback(err);
          }
        });
      }

      if (mail.data.mailgun.rv) {
        try {
          data['recipient-variables'] =
            JSON.stringify(mail.data.mailgun.rv);
        } catch (err) {
          return callback(err);
        }
      }
    }

    if (debug.data) {
      console.log(data);
    }

    var req = request.post(endpoint, handler)
                .auth(username, password, true),
        form = req.form();

    _.forOwn(data, function (value, key, object) {
      if ((key == 'text' || key == 'html') && value.path) {
        stat = fs.statSync(value.path);
        fileSize = stat.size - (value.start ? value.start : 0);
        delete value.path;
        form.append(key, value, { knownLength: fileSize });
      } else if (key == 'attachment') {
        _.forOwn(value, function (val, k, obj) {
          if (val.options.cid) {
            val.options.filename = val.options.cid;
            form.append('inline', val.value, val.options);
          } else {
            form.append(key, val.value, val.options);
          }
        });
      } else {
        form.append(key, value);
      }
    });

    function handler (err, res, body) {
      var info = {};
      if (err) {
        return callback(err);
      } else if (res.statusCode != 200) {
        return callback(new Error(res.statusCode + ' ' +
                            http.STATUS_CODES[res.statusCode]));
      } else {
        try {
          info = JSON.parse(body);
        } catch (e) {
          return callback(e);
        }
        info.messageId = (info.id || '').replace(/(^<)|(>$)/g, '');
        return callback(null, info);
      }
    }

  }

  return {
    name: 'Mailgun',
    version: require('../package.json').version,
    send: send
  };
};
