'use strict';

(function () {
  var application = angular.module('civApp', [
    'ngAnimate',
    'ngResource',
    'ngRoute',
    'ngSanitize',
    'ngMessages',
    'ui.bootstrap',
    'ngTouch',
    'ab-base64',
    'angular-growl',
    'ngTable',
    'nya.bootstrap.select'
  ]);

  application.config(function ($routeProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/list.html',
        controller: "GameListController as gameListCtrl",
        resolve: {
          games: ["GameService", function(m) {
            return m.getAllGames();
          }]
        }
      })
      .when('/game/:id', {
        templateUrl: 'views/game.html',
        controller: "ChatController as chatCtrl",
        resolve: {
          chatList: ["GameService", "$route", function(m, r) {
            //return m.getChatList(r.$$url.split('/')[2]);
            return m.getChatList(r.current.params.id);
          }]
        }
        //Use resolve when you want the data to appear before going to the page
        /*
         ,resolve: {
         game = function(GameService) { GameService.getGame(gameId) }
         Then put this game in the controller, but you need to define controller here also
         }
         */
      })
      .when('/help', {
        templateUrl: 'views/help.html'
      })
      .when('/about', {
        templateUrl: 'views/about.html'
      })
      .when('/logout', {
        redirectTo: '/'
      })
      .when('/endgame', {
        redirectTo: '/'
      })
      .otherwise({
        templateUrl: '404.html'
      });
  });

  application.config(function (growlProvider) {
    growlProvider.globalTimeToLive(7000);
    growlProvider.globalDisableCountDown(false);
    growlProvider.globalPosition('top-center');
    growlProvider.onlyUniqueMessages(true);
  })
    .constant('BASE_URL', 'https://civilization-boardgame-rest.herokuapp.com/api');

}());

'use strict';
(function (civApp) {

  civApp.config(["$provide", function ($provide) {
    $provide.provider("GameService", ["BASE_URL", function (BASE_URL) {
      var games = {};
      var playersCache = {};
      var loading = {};
      var playerLoading = {};
      var baseUrl = BASE_URL + "/game/";

      this.$get = ["$http", "$log", "growl", "$location", "$q", "formEncode", "currentUser", function ($http, $log, growl, $location, $q, formEncode, currentUser) {
        var createGame = function (game) {
          if (!game) {
            return $q.reject("No game to create");
          }
          var newGameDTO = {
            "name": game.name,
            "type": game.type,
            "numOfPlayers": game.numOfPlayers,
            "color": game.color
          };

          //$log.info("Before calling post, json is ", angularN.toJson(newGameDTO));

          return $http.post(baseUrl, newGameDTO)
            .success(function (data, status, headers) {
              growl.success("Game created!");
              var loc = headers('Location');
              if (loc) {
                /* jshint ignore:start */
                var gameid = _.last(loc.split('/'));
                if (gameid) {
                  $location.path('/game/' + gameid);
                }
                /* jshint ignore:end */
              }
              return data;
            })
            .error(function (data) {
              growl.error("Could not create game");
              return data;
            });
        };

        var joinGame = function (game) {
          if (!game || !game.id) {
            return $q.reject("No game to join");
          }
          return $http.post(baseUrl + game.id + "/join")
            .then(function (response) {
              return response.data;
            });
        };

        var fetchGameByIdFromServer = function (id) {
          var url = baseUrl + id;
          var cacheid = id + currentUser.profile.id;

          loading[cacheid] = true;
          return $http.get(url)
            .then(function (response) {
              games[cacheid] = response.data;
              loading[cacheid] = false;
              return response.data;
            });
        };

        var getGameById = function (id) {
          var cacheid = id + currentUser.profile.id;
          if (games[cacheid]) {
            return games[cacheid];
          }
          if (loading[cacheid]) {
            return;
          }

          fetchGameByIdFromServer(id);
        };

        var getAllGames = function () {
          //return $http.get(baseUrl, {cache: true})
          return $http.get(baseUrl)
            .then(function (response) {
              return response.data;
            });
        };

        var undoDraw = function (gameid, logid) {
          var url = baseUrl + gameid + "/undo/" + logid;
          $http.put(url)
            .success(function (response) {
              growl.success("Undo initiated!");
              return response;
            }).success(function (response) {
              fetchGameByIdFromServer(gameid);
              return response;
            })
            .error(function (data, status) {
              if (status === 400) {
                growl.error("Undo already initiated");
              } else {
                growl.error("Could not initiate undo for unknown reason");
              }
              return data;
            });
        };

        var getAvailableTechs = function (gameid) {
          if (!gameid) {
            return $q.reject("No gameid");
          }
          var url = baseUrl + gameid + "/techs";
          return $http.get(url)
            .then(function (response) {
              $log.info("Got all available techs");
              return response.data;
            });
        };

        var voteYes = function (gameid, logid) {
          var url = baseUrl + gameid + "/vote/" + logid + "/yes";
          $http.put(url)
            .success(function (response) {
              growl.success("You voted yes!");
              return response;
            }).success(function (response) {
              fetchGameByIdFromServer(gameid);
              return response;
            })
            .error(function (data, status) {
              if (status === 412) {
                growl.error("Could not register vote. Nothing to vote on");
              } else {
                growl.error("Could not vote for unknown reason");
              }
              return data;
            });
        };

        var voteNo = function (gameid, logid) {
          var url = baseUrl + gameid + "/vote/" + logid + "/no";
          $http.put(url)
            .success(function (response) {
              growl.success("You voted no!");
              return response;
            }).success(function (response) {
              fetchGameByIdFromServer(gameid);
              return response;
            })
            .error(function (data, status) {
              if (status === 412) {
                growl.error("Could not register vote. Nothing to vote on");
              } else {
                growl.error("Could not vote for unknown reason");
              }
              return data;
            });
        };

        var getChatList = function (gameid) {
          if (!gameid) {
            return $q.reject("No gameid");
          }
          var url = baseUrl + gameid + "/chat/";
          return $http.get(url)
            .then(function (response) {
              return response.data;
            });
        };

        var chat = function (gameid, message) {
          if (!gameid || !message) {
            return $q.reject('No gameid or chat message');
          }

          var url = baseUrl + gameid + "/chat/";

          var configuration = {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            }
          };

          var data = formEncode({
            message: encodeURIComponent(message)
          });

          return $http.post(url, data, configuration)
            .then(function (response) {
              return response.data;
            });
        };

        var players = function (gameid) {
          var cacheid = gameid + currentUser.profile.id;
          if (playerLoading[cacheid]) {
            return;
          }

          if (playersCache[cacheid]) {
            return playersCache[cacheid];
          }

          return fetchPlayersFromServer(gameid);
        };

        var fetchPlayersFromServer = function (gameid) {
          if (!gameid) {
            return $q.reject("No gameid");
          }
          var cacheid = gameid + currentUser.profile.id;
          var url = baseUrl + gameid + "/players";
          playerLoading[cacheid] = true;
          return $http.get(url, {cache: true})
            .then(function (response) {
              playersCache[cacheid] = response.data;
              playerLoading[cacheid] = false;
              return response.data;
            });
        };

        var endGame = function (gameid) {
          if (!gameid) {
            return $q.reject("No gameid");
          }
          return $http.delete(baseUrl + gameid)
            .then(function (response) {
              growl.info("Game has ended");
              return response.data;
            });
        };

        var withdrawFromGame = function (gameid) {
          if (!gameid) {
            return $q.reject("No gameid");
          }
          return $http.post(baseUrl + gameid + "/withdraw")
            .then(function (response) {
              growl.info("You have withdrawn from the game");
              return response.data;
            });
        };

        var updateMapLink = function (gameid, maplink) {
          if (!maplink || !gameid) {
            return $q.reject("No maplink or gameid");
          }
          var url = baseUrl + gameid + "/map/";

          var configuration = {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            }
          };

          var data = formEncode({
            link: encodeURIComponent(maplink)
          });

          return $http.post(url, data, configuration)
            .then(function (response) {
              return response.data;
            });
        };

        var updateAssetLink = function (gameid, assetlink) {
          if (!assetlink || !gameid) {
            return $q.reject("No assetlink or gameid");
          }
          var url = baseUrl + gameid + "/asset/";

          var configuration = {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            }
          };

          var data = formEncode({
            link: encodeURIComponent(assetlink)
          });

          return $http.post(url, data, configuration)
            .then(function (response) {
              return response.data;
            });
        };

        return {
          getAllGames: getAllGames,
          getGameById: getGameById,
          fetchGameByIdFromServer: fetchGameByIdFromServer,
          joinGame: joinGame,
          createGame: createGame,
          undoDraw: undoDraw,
          getAvailableTechs: getAvailableTechs,
          voteYes: voteYes,
          voteNo: voteNo,
          getChatList: getChatList,
          chat: chat,
          players: players,
          fetchPlayersFromServer: fetchPlayersFromServer,
          endGame: endGame,
          withdrawFromGame: withdrawFromGame,
          updateMapLink: updateMapLink,
          updateAssetLink: updateAssetLink
        };
      }];

    }]);
  }]);

}(angular.module("civApp")));

'use strict';
(function (civApp) {

  civApp.factory('DrawService', ["$http", "$q", "$log", "growl", "currentUser", "BASE_URL", "GameService", "Util", function ($http, $q, $log, growl, currentUser, BASE_URL, GameService, Util) {
    var baseUrl = BASE_URL + "/draw/";

    var drawUnitsFromHand = function(gameId, numOfUnits) {
      var url = baseUrl + gameId + "/battle";

      return $http({
        url: url,
        method: "PUT",
        params: {numOfUnits: numOfUnits}
      })
        .success(function (response) {
          if(response.length > 0) {
            growl.success("Units added to battlehand");
          } else {
            growl.warning("You have no units to draw");
          }
          return response;
        })
        .success(function (response) {
          GameService.fetchGameByIdFromServer(gameId);
          return response;
        })
        .error(function (data) {
          $log.error(data);
          growl.error("Could not add units to battlehand for unknown reason");
          return data;
        });
    };

    var drawBarbarians = function (gameId) {
      var url = baseUrl + gameId + "/battle/barbarians";

      return $http.put(url)
        .success(function (response) {
          growl.success("Barbarians have been drawn");
          return response;
        })
        .success(function (response) {
          GameService.fetchGameByIdFromServer(gameId);
          return response;
        })
        .error(function (data) {
          $log.error(data);
          if(data.status === 412) {
            growl.error("Cannot draw more barbarians until the others are discarded");
          } else {
            growl.error("Unable to draw barbarian units");
          }
          return data;
        });
    };

    var discardBarbarians = function(gameId) {
      var url = baseUrl + gameId + "/battle/discard/barbarians";

      return $http.post(url)
        .success(function (response) {
          growl.success("Barbarians discarded");
          return response;
        }).success(function (response) {
          GameService.fetchGameByIdFromServer(gameId);
          return response;
        })
        .error(function () {
          growl.error("Could not discard barbarians for unknown reason");
          return $q.reject();
        });
    };

    var revealHand = function(gameId) {
      var url = baseUrl + gameId + "/battlehand/reveal";
      return $http.put(url)
        .success(function (response) {
          growl.success("Units are revealed and discarded from hand");
          return response;
        }).success(function (response) {
          GameService.fetchGameByIdFromServer(gameId);
          return response;
        })
        .error(function () {
          growl.error("Units could not be revealed and discarded");
        });
    };

    var drawItem = function (gameId, sheetName) {
      var url = baseUrl + gameId + "/" + sheetName;
      return $http.post(url)
        .success(function (response) {
          growl.success("Item successfully drawn");
          return response;
        }).success(function (response) {
          GameService.fetchGameByIdFromServer(gameId);
          return response;
        })
        .error(function (data, status) {
          if (status === 410) {
            growl.error("There are no more " + sheetName + " to draw!");
          } else {
            growl.error("Item could not be drawn");
          }
        });
    };

    var loot = function (gameId, sheetName, playerId) {
      var url = baseUrl + gameId + "/" + sheetName + "/loot/" + playerId;
      return $http.post(url)
        .success(function (response) {
          var item = Util.nextElement(response);
          growl.success("Item " + item.name + " looted by another player");
          return response;
        }).success(function (response) {
          GameService.fetchGameByIdFromServer(gameId);
          return response;
        })
        .error(function(data) {
        // called asynchronously if an error occurs
        // or server returns response with an error status.
          growl.error("Item could not be lootet");
          return data;
        });
    };

    return {
      drawUnitsFromHand: drawUnitsFromHand,
      revealHand: revealHand,
      discardBarbarians: discardBarbarians,
      drawBarbarians: drawBarbarians,
      drawItem: drawItem,
      loot: loot
    };

  }]);

}(angular.module("civApp")));

'use strict';
(function (civApp) {

    civApp.factory('PlayerService', ["$http", "$q", "$log", "growl", "currentUser", "BASE_URL", "GameService", "Util", function ($http, $q, $log, growl, currentUser, BASE_URL, GameService, Util) {
        var baseUrl = BASE_URL + "/player/";

        var revealItem = function (gameId, item) {
            if(!gameId || !item) {
                return $q.reject("No gameId or logid");
            }
            var url = baseUrl + gameId + "/item/reveal";

            var itemDTO = {
                "name": Util.nextElement(item).name,
                "ownerId": Util.nextElement(item).ownerId,
                "sheetName": Util.nextElement(item).sheetName,
                "pbfId": gameId
            };

            $log.info("Before calling put, json is ", angular.toJson(itemDTO));
            var configuration = {
                headers: {
                    "Content-Type": "application/json"
                }
            };

            return $http.put(url, itemDTO, configuration)
                .success(function (response) {
                    growl.success("Item revealed");
                    return response;
                }).success(function (response) {
                    GameService.fetchGameByIdFromServer(gameId);
                    return response;
                })
                .error(function () {
                    growl.error("Item could not be revealed");
                });
        };

        var revealTech = function (gameId, logid) {
            if(!gameId || !logid) {
                return $q.reject("No gameId or logid");
            }
            var url = baseUrl + gameId + "/tech/reveal/" + logid;
            $http.put(url)
                .success(function (response) {
                    growl.success("Research revealed!");
                    return response;
                }).success(function (response) {
                    GameService.fetchGameByIdFromServer(gameId);
                    return response;
                })
                .error(function (data) {
                    growl.error("Could not reveal tech");
                    return data;
                });
        };

        var discardItem = function (gameId, item) {
            if(!gameId || !item) {
                return $q.reject("No gameId or item");
            }
            var url = baseUrl + gameId + "/item/discard";

            var itemDTO = {
                "name": Util.nextElement(item).name,
                "ownerId": Util.nextElement(item).ownerId,
                "sheetName": Util.nextElement(item).sheetName,
                "pbfId": gameId
            };

            $log.info("Before calling post, json is ", angular.toJson(itemDTO));

            var configuration = {
                headers: {
                    "Content-Type": "application/json"
                }
            };

            $http.post(url, itemDTO, configuration)
                .success(function (response) {
                    growl.success("Item discarded");
                    return response;
                }).success(function (response) {
                    GameService.fetchGameByIdFromServer(gameId);
                    return response;
                }).error(function (data) {
                    growl.error("Item could not be discarded");
                    return data;
                });
        };

        var endTurn = function (gameId) {
            if(!gameId) {
                return $q.reject("No gameId");
            }
            var url = baseUrl + gameId + "/endturn";
            return $http.post(url)
                .success(function (response) {
                    growl.success("Turn ended");
                    return response;
                }).success(function (response) {
                    GameService.fetchGameByIdFromServer(gameId);
                    return response;
                })
                .error(function (data) {
                    growl.error("Could not end turn");
                    return data;
                });
        };

        var getChosenTechs = function (gameId) {
            if(!gameId) {
                return $q.reject("No gameId");
            }
            var url = baseUrl + gameId + "/tech/" + currentUser.profile.id;
            return $http.get(url)
                .then(function (response) {
                    return response.data;
                }, function (data) {
                    $log.error(data);
                    growl.error("Could not get chosen techs");
                    return $q.reject();
                });
        };

        var selectTech = function (gameId, selectedTech) {
            if(!gameId || !selectedTech) {
                return $q.reject("No gameId or tech");
            }
            var url = baseUrl + gameId + "/tech/choose";

            return $http({
                url: url,
                method: "POST",
                params: {name: selectedTech.tech.name}
            })
                .success(function (response) {
                    growl.success("Tech chosen successfully");
                    return response;
                }).success(function (response) {
                    GameService.fetchGameByIdFromServer(gameId);
                    return response;
                }).error(function (data) {
                    growl.error("Could not choose tech");
                    return data;
                });
        };

        var removeTech = function (gameId, techName) {
            if(!gameId || !techName) {
                return $q.reject("No gameId or tech");
            }
            var url = baseUrl + gameId + "/tech/remove";

            return $http({
                url: url,
                method: "DELETE",
                params: {name: techName}
            })
                .success(function (response) {
                    growl.success("Tech removed successfully");
                    return response;
                }).success(function (response) {
                    GameService.fetchGameByIdFromServer(gameId);
                    return response;
                }).error(function (data) {
                    $log.error(data);
                    growl.error("Could not remove tech");
                    return data;
                });
        };

        var trade = function (gameId, item) {
            if (!gameId || !item) {
                return $q.reject("Couldn't get gameId or item");
            }
            var url = baseUrl + gameId + "/trade/";

            var itemDTO = {
                "name": item.name,
                "sheetName": item.sheetName,
                "pbfId": gameId,
                "ownerId": item.ownerId
            };

            $log.info("Before calling post, json is ", angular.toJson(itemDTO));

            var configuration = {
                headers: {
                    "Content-Type": "application/json"
                }
            };

            $http.post(url, itemDTO, configuration)
                .success(function (response) {
                    growl.success("Item sent to another player");
                    return response;
                }).success(function (response) {
                    GameService.fetchGameByIdFromServer(gameId);
                    return response;
                }).error(function (data) {
                    growl.error("Item could not be sent to another player");
                    return data;
                });
        };

        return {
            revealItem: revealItem,
            revealTech: revealTech,
            discardItem: discardItem,
            endTurn: endTurn,
            selectTech: selectTech,
            getChosenTechs: getChosenTechs,
            removeTech: removeTech,
            trade: trade
        };

    }]);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var requestCounter = function ($q) {

    var requests = 0;

    var request = function (config) {
      requests += 1;
      return $q.when(config);
    };

    var requestError = function (error) {
      requests -= 1;
      return $q.reject(error);
    };

    var response = function (response) {
      requests -= 1;
      return $q.when(response);
    };

    var responseError = function (error) {
      requests -= 1;
      return $q.reject(error);
    };

    var getRequestCount = function () {
      return requests;
    };

    return {
      request: request,
      response: response,
      requestError: requestError,
      responseError: responseError,
      getRequestCount: getRequestCount
    };

  };
  requestCounter.$inject = ["$q"];

  module.factory("requestCounter", requestCounter);

  module.config(["$httpProvider", function ($httpProvider) {
    $httpProvider.interceptors.push("requestCounter");
  }]);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var localStorage = function ($window) {

    var store = $window.localStorage;

    var add = function (key, value) {
      value = angular.toJson(value);
      store.setItem(key, value);
    };

    var get = function (key) {
      var value = store.getItem(key);
      if (value) {
        value = angular.fromJson(value);
      }
      return value;
    };

    var remove = function (key) {
      store.removeItem(key);
    };

    return {
      add: add,
      get: get,
      remove: remove
    };
  };
  localStorage.$inject = ["$window"];

  module.factory("localStorage", localStorage);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var formEncode = function () {
    return function (data) {
      var pairs = [];
      for (var name in data) {
        pairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(data[name]));
      }
      return pairs.join('&').replace(/%20/g, '+');
    };
  };

  module.factory("formEncode", formEncode);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var loginRedirect = function () {

    var loginUrl = "/auth";
    var lastPath = "";

    this.$get = ["$q", "$location", function ($q, $location) {

      return {

        responseError: function (response) {
          if (response.status === 401) {
            lastPath = $location.path();
            $location.path(loginUrl);
          }
          return $q.reject(response);
        },

        redirectPreLogin: function () {
          if (lastPath) {
            $location.path(lastPath);
            lastPath = "";
          } else {
            $location.path("/");
          }
        }
      };
    }];
  };

  module.provider("loginRedirect", loginRedirect);
  module.config(["$httpProvider", function ($httpProvider) {
    $httpProvider.interceptors.push("loginRedirect");
  }]);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var USERKEY = "authorizationEncoded";

  var currentUser = function (localStorage) {
    var saveUser = function () {
      localStorage.add(USERKEY, profile);
    };

    var removeUser = function () {
      localStorage.remove(USERKEY);
    };

    var initialize = function () {
      var user = {
        username: "",
        password: "",
        id: "",
        authorizationEncoded: "",
        get loggedIn() {
          //$log.info("Checking if user is logged in " + this.authorizationEncoded);
          return this.authorizationEncoded ? true : false;
        }
      };

      var localUser = localStorage.get(USERKEY);
      if (localUser) {
        user.username = localUser.username;
        user.password = localUser.password;
        user.id = localUser.id;
        user.authorizationEncoded = localUser.authorizationEncoded;
      }
      return user;
    };

    var profile = initialize();

    return {
      save: saveUser,
      remove: removeUser,
      profile: profile
    };
  };
  currentUser.$inject = ["localStorage"];

  module.factory("currentUser", currentUser);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var addToken = function (currentUser, $q) {

    return {
      request: function (config) {
        if (currentUser.profile.authorizationEncoded) {
          //$log.debug("Adding authorization to header " + "Basic " + currentUser.profile.authorizationEncoded);
          config.headers.Authorization = "Basic " + currentUser.profile.authorizationEncoded;
        }
        return $q.when(config);
      }
    };
  };
  addToken.$inject = ["currentUser", "$q"];

  module.factory("addToken", addToken);
  module.config(["$httpProvider", function ($httpProvider) {
    $httpProvider.interceptors.push("addToken");
  }]);

})(angular.module("civApp"));

'use strict';
(function (module) {

  var basicauth = function () {
    this.$get = function ($http, formEncode, currentUser, base64, BASE_URL, growl) {
      var url = BASE_URL + '/auth';

      var processToken = function (username, password) {
        return function (response) {
          currentUser.profile.username = username;
          currentUser.profile.id = response.data.id;
          currentUser.profile.authorizationEncoded = base64.encode(username + ':' + password);
          currentUser.save();
          return username;
        };
      };

      var login = function (username, password) {
        var configuration = {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          }
        };

        var data = formEncode({
          username: encodeURIComponent(username),
          password: encodeURIComponent(password),
          grant_type: 'password'
        });

        return $http.post(url + '/login', data, configuration)
          .then(
          processToken(username, password),
          function () {
            growl.error('Invalid login');
          }
        );
      };

      var logout = function () {
        currentUser.profile.username = '';
        currentUser.profile.password = '';
        currentUser.profile.authorizationEncoded = '';
        currentUser.profile.id = '';
        currentUser.remove();
      };

      var register = function (register) {
        var configuration = {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          }
        };

        var data = formEncode({
          username: encodeURIComponent(register.username),
          password: encodeURIComponent(base64.encode(register.password)),
          email: encodeURIComponent(register.email)
        });

        return $http.post(url + '/register', data, configuration)
          .success(function (response) {
            growl.success('User created');
            return response;
          }).success(function (response) {
            login(register.username, register.password);
            return response;
          }).error(function (data) {
            growl.error('Could not register');
            return data;
          });
      };

      return {
        login: login,
        logout: logout,
        register: register
      };
    };
  };

  module.config(["$provide", function ($provide) {
    $provide.provider('basicauth', [basicauth]);
  }]);

}(angular.module('civApp')));


'use strict';
(function (module) {

  /**
   * Utility factory
   */
  var util = function() {

    /**
     * Returns the next element in the object
     * @param obj
     * @returns {*}
     */
    var nextElement = function(obj) {
      if(obj) {
        var keys = Object.keys(obj);
        if(keys && keys.length > 0) {
          return obj[keys[0]];
        }
      }
      return obj;
    };

    var mapLink = function(id) {
      var base = "https://docs.google.com/presentation/d/";
      var end = "/embed?start=false&loop=false&delayms=3000";
      return base + id + end;
    };

    var assetLink = function(id) {
      var base = "https://docs.google.com/spreadsheets/d/";
      var end = "/pubhtml?widget=true&amp;headers=false";
      return base + id + end;
    };

    return {
      nextElement: nextElement,
      mapLink: mapLink,
      assetLink: assetLink
    };
  };

  module.factory("Util", util);

}(angular.module("civApp")));

'use strict';
(function(module) {

  var options = function() {
    this.value = {
      show: false,
      showEndGame: false
    };

    this.getValue = function() {
      return this.value;
    };

    this.setShowValue = function(val) {
      this.value.show = val;
    };

    this.setShowEndGameValue = function(val) {
      this.value.showEndGame = val;
    };
  };

  module.service("GameOption", options);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var workSpinner = function (requestCounter) {
    return {
      restrict: "EAC",
      transclude: true,
      scope: {},
      template: "<ng-transclude ng-show='requestCount'></ng-transclude>",
      link: function (scope) {

        scope.$watch(function () {
          return requestCounter.getRequestCount();
        }, function (requestCount) {
          scope.requestCount = requestCount;
        });

      }
    };
  };
  workSpinner.$inject = ["requestCounter"];

  module.directive("workSpinner", workSpinner);

}(angular.module("civApp")));

'use strict';
/**
 * A generic confirmation for risky actions.
 * Usage: Add attributes: ng-really-message="Are you sure"? ng-really-click="takeAction()" function
 */
/* jshint ignore:start */
angular.module('civApp').directive('ngReallyClick', [function() {
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      element.bind('click', function() {
        var message = attrs.ngReallyMessage;
        if (message && confirm(message)) {
          scope.$apply(attrs.ngReallyClick);
        }
      });
    }
  };
}]);
/* jshint ignore:end */

'use strict';
/**
 * Copied and modified from ng-signup-form
 * https://github.com/zemirco/ng-signup-form
 */
angular.module('civApp').directive('uniqueUsername', ['$http', 'BASE_URL', function($http, BASE_URL) {
  return {
    require: 'ngModel',
    link: function(scope, elem, attrs, ctrl) {
      scope.busy = false;
      scope.$watch(attrs.ngModel, function(value) {

        // hide old error messages
        ctrl.$setValidity('isTaken', true);
        ctrl.$setValidity('invalidChars', true);
        if(!value) {
          return;
        }

        var url = BASE_URL + '/auth/register/check/username';
        scope.busy = true;
        $http.post(url, {name: value})
          .success(function() {
            // everything is fine -> do nothing
            scope.busy = false;
          })
          .error(function(data) {
            // display new error message
            if (data.isTaken) {
              ctrl.$setValidity('isTaken', false);
            } else if (data.invalidChars) {
              ctrl.$setValidity('invalidChars', false);
            }
            scope.busy = false;
          });
      });
    }
  };
}]);

'use strict';
/**
 * Copied and modified from ng-signup-form
 * https://github.com/zemirco/ng-signup-form
 */
angular.module('civApp').directive('uniqueGamename', ['$http', 'BASE_URL', function($http, BASE_URL) {
  return {
    require: 'ngModel',
    link: function(scope, elem, attrs, ctrl) {
      scope.busy = false;
      scope.$watch(attrs.ngModel, function(value) {

        // hide old error messages
        ctrl.$setValidity('isTaken', true);
        ctrl.$setValidity('invalidChars', true);
        if(!value) {
          return;
        }

        var url = BASE_URL + '/game/check/gamename';
        scope.busy = true;
        $http.post(url, {name: value})
          .success(function() {
            // everything is fine -> do nothing
            scope.busy = false;
          })
          .error(function(data) {
            // display new error message
            if (data.isTaken) {
              ctrl.$setValidity('isTaken', false);
            } else if (data.invalidChars) {
              ctrl.$setValidity('invalidChars', false);
            }
            scope.busy = false;
          });
      });
    }
  };
}]);

'use strict';
// http://codepen.io/brunoscopelliti/pen/ECyka

angular.module('civApp').directive('match', [function () {
  return {
    require: 'ngModel',
    link: function (scope, elem, attrs, ctrl) {

      scope.$watch('[' + attrs.ngModel + ', ' + attrs.match + ']', function (value) {
        ctrl.$setValidity('match', value[0] === value[1]);
      }, true);

    }
  };
}]);

'use strict';
(function (module) {
  var GameListController = function (games, $log, GameService, currentUser, $modal, $scope) {
    var model = this;

    model.isUserPlaying = function(players) {
      if(players) {
        for(var i = 0; i < players.length; i++) {
          var player = players[i];
          if(player && player.username === model.user.username) {
            return true;
          }
        }
      }
      return false;
    };

    model.joinGame = function (game) {
      var joinPromise = GameService.joinGame(game)
        .then(function (game) {
          model.game = game;
          $scope.userHasAccess = game.player && game.player.username === model.user.username;
          model.yourTurn = game.player && game.player.yourTurn;
          return game;
        });

      $log.debug("User wants to join game with nr " + game.id);
      return joinPromise;
    };

    model.showMyGames = function() {
      //Binding with primitives can break two-way-binding in angular. Must add the a value
      if($scope.onlyMyGames.value) {
        $scope.filterContent = model.user.username;
      } else {
        $scope.filterContent = "";
      }
    };

    model.openCreateNewGame = function(size) {
      var modalInstance = $modal.open({
        templateUrl: 'createNewGame.html',
        controller: 'RegisterController as registerCtrl',
        size: size
      });

      modalInstance.result.then(function(game) {
        if(game) {
          $log.info(game.name);
          $log.info(game.type);
          $log.info(game.numOfPlayers);
          $log.info(game.color);
          GameService.createGame(game);
        }
      }, function () {
        //Cancel callback here
      });
    };

    var initialize = function () {
      model.user = currentUser.profile;
      model.games = [];
      model.finishedGames = [];
      $scope.onlyMyGames = {};
      /* jshint ignore:start */
      _.forEach(games, function(g) {
        if(g.active) {
          model.games.push(g);
        } else {
          model.finishedGames.push(g);
        }
      });
      /* jshint ignore:end */
      $log.info("Got games");
    };

    initialize();
  };

  module.controller("GameListController",
    ["games", "$log", "GameService", "currentUser", "$modal", "$scope", GameListController]);

}(angular.module("civApp")));

'use strict';
(function (module) {
var GameController = function ($log, $routeParams, GameService, PlayerService, currentUser, Util, GameOption, $filter, ngTableParams, $scope, growl, $modal, $sce) {
  var model = this;

  $scope.$watch(function () {
    return GameService.getGameById(model.gameId);
  }, function (newVal) {
    if (!newVal) {
      return;
    }
    var game = newVal;
    $scope.currentGame = game;

    if(!$scope.currentGame.mapLink) {
      $scope.currentGame.mapLink = $sce.trustAsResourceUrl("https://docs.google.com/presentation/d/1hgP0f6hj4-lU6ysdOb02gd7oC5gXo8zAAke4RhgIt54/embed?start=false&loop=false&delayms=3000");
    } else {
      $scope.currentGame.mapLink = $sce.trustAsResourceUrl(Util.mapLink($scope.currentGame.mapLink));
    }

    if(!$scope.currentGame.assetLink) {
      $scope.currentGame.assetLink = $sce.trustAsResourceUrl("https://docs.google.com/spreadsheets/d/10-syTLb2i2NdB8T_alH9KeyzT8FTlBK6Csmc_Hjjir8/pubhtml?widget=true&amp;headers=false");
    } else {
      $scope.currentGame.assetLink = $sce.trustAsResourceUrl(Util.assetLink($scope.currentGame.assetLink));
    }

    var hasAccess = game.player && game.player.username === model.user.username && game.active;
    $scope.userHasAccess = hasAccess;
    GameOption.setShowValue(hasAccess);
    GameOption.setShowEndGameValue(hasAccess && game.player.gameCreator);

    if(game.active) {
      //Check votes
      /* jshint ignore:start */
      _.forEach(game.publicLogs, function(log) {
        if($scope.canVote(log)) {
          growl.warning("An undo was requested which needs your vote");
          return false;
        }
      });
      /* jshint ignore:end */

      model.yourTurn = game.player && game.player.yourTurn;

      if(model.yourTurn) {
        growl.info("<strong>It's your turn! Press end turn when you are done!</strong>");
      }
    }

    model.tableParams.reload();
    return game;
  });

  model.endTurn = function () {
    $log.info("Ending turn");
    PlayerService.endTurn(model.gameId);
  };

  //In scope so that we can use it from another view which is included
  $scope.canInitiateUndo = function(log) {
    return checkPermissionForVote(log) && !log.draw.undo;
  };

  function checkPermissionForVote(log) {
    return $scope.userHasAccess && log && log.draw && log.log.indexOf("drew") > -1;
  }

  //In scope so that we can use it from another view which is included
  $scope.initiateUndo = function(logid) {
    GameService.undoDraw($routeParams.id, logid);
  };

  //In scope so that we can use it from another view which is included
  $scope.canVote = function(log) {
    var hasVoted = false;
    if(checkPermissionForVote(log) && log.draw.undo) {
      //Take out the users
      var votes = log.draw.undo.votes;

      for(var vote in votes) {
        if(vote === model.user.id) {
          return false;
        }
      }
      return true;
    }
    return hasVoted;
  };

  $scope.openModalVote = function(size, log) {
    var modalInstance = $modal.open({
      templateUrl: 'modalVote.html',
      controller: 'VoteController',
      size: size,
      resolve: {
        logToUndo: function () {
          return log;
        }
      }
    });

    modalInstance.result.then(function(vote) {
      $log.info('Vote was ' + vote.vote + ' and logid is ' + vote.id);
      if(vote.vote) {
        GameService.voteYes(model.gameId, vote.id);
      } else {
        GameService.voteNo(model.gameId, vote.id);
      }
    }, function () {
      $log.info('Modal dismissed at: ' + new Date());
    });
  };

  model.updateMapLink = function() {
    var link = $scope.currentGame.newMapLink;
    var startsWith = new RegExp('^' + "https://docs.google.com/presentation/d/", 'i');
    if(!startsWith.test(link)) {
      growl.error("Wrong URL. Must start with https://docs.google.com/presentation/d/");
      return;
    }
    var mapPromise = GameService.updateMapLink($routeParams.id, link)
      .then(function(data) {
        if(data) {
          var link = Util.mapLink(data.msg);
          $log.info("Map link is " + link);
          $scope.currentGame.mapLink = $sce.trustAsResourceUrl(link);
        }
      });
    return mapPromise;
  };

  model.updateAssetLink = function() {
    var link = $scope.currentGame.newAssetLink;
    var startsWith = new RegExp('^' + "https://docs.google.com/spreadsheets/d/", 'i');
    if(!startsWith.test(link)) {
      growl.error("Wrong URL. Must start with https://docs.google.com/spreadsheets/d/");
      return;
    }
    var assetPromise = GameService.updateAssetLink($routeParams.id, link)
      .then(function(data) {
        if(data) {
          var link = Util.assetLink(data.msg);
          $log.info("Asset link is " + link);
          $scope.currentGame.assetLink = $sce.trustAsResourceUrl(link);
        }
      });
    return assetPromise;
  };

  /* jshint ignore:start */
  model.tableParams = new ngTableParams({
    page: 1,            // show first page
    count: 10,          // count per page
    sorting: {
      created: 'desc'     // initial sorting
    }
  }, {
    total: 0, // length of data
    getData: function ($defer, params) {
      // use build-in angular filter
      // update table params
      if (!$scope.currentGame) {
        $defer.reject("No game yet");
        return;
      }
      var game = $scope.currentGame;
      var lastLog = _.last(game.publicLogs);
      if(lastLog && lastLog.log) {
        $scope.latestLog = lastLog.log;
      }

      var orderedData = params.sorting() ? $filter('orderBy')(game.publicLogs, params.orderBy()) : game.publicLogs;
      params.total(game.publicLogs.length);
      $defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
    },
    $scope: { $data: {}, $emit: function () {}}
  });
  /* jshint ignore:end */

  /**
   * Returns the next element in the object
   * @param obj
   * @returns obj.next
   */
  model.nextElement = function(obj) {
    return Util.nextElement(obj);
  };

  var initialize = function() {
    model.user = currentUser.profile;
    $scope.userHasAccess = false;
    model.yourTurn = false;
    model.gameId = $routeParams.id;
    model.GameOption = GameOption;
  };

  initialize();

};

  module.controller("GameController",
    ["$log", "$routeParams", "GameService", "PlayerService", "currentUser", "Util", 'GameOption', "$filter", "ngTableParams", "$scope", "growl", "$modal", "$sce", GameController]);

}(angular.module("civApp")));

'use strict';
(function (module) {

  var NavController = function (GameService, $routeParams, basicauth, currentUser, growl, loginRedirect, GameOption, $modal) {
    var model = this;
    model.GameOption = GameOption;
    model.user = currentUser.profile;

    model.username = "";
    model.password = "";
    model.user = currentUser.profile;

    model.registerUsername = null;
    model.registerEmail = null;
    model.registerPassword = null;
    model.registerVerification = null;

    model.clearOptions = function() {
      GameOption.setShowValue(false);
      GameOption.setShowEndGameValue(false);
    };

    model.endGame = function() {
      var game = GameService.getGameById($routeParams.id);

      if(game && game.player && game.player.gameCreator) {
        model.clearOptions();
        GameService.endGame($routeParams.id);
      } else {
        growl.error('Only the game creator can end a game!');
      }
    };

    model.withdrawGame = function() {
      var game = GameService.getGameById($routeParams.id);
      if(game && game.player) {
        if(game.player.gameCreator) {
          growl.error('As game creator you cannot withdraw from the game. You can only end it!');
          return;
        }

        if(game.player.username === model.user.username) {
          model.clearOptions();
          GameService.withdrawFromGame($routeParams.id);
        } else {
          growl.error('Only player playing the game can withdraw from it!');
        }
      }
    };

    model.login = function (form) {
      if (form.$valid) {
        basicauth.login(model.username, model.password)
          .then(loginRedirect.redirectPreLogin);
        model.password = "";
      }
    };

    model.signOut = function () {
      basicauth.logout();
    };

    model.openSignup = function(size) {
      var modalInstance = $modal.open({
        templateUrl: 'signup.html',
        controller: 'RegisterController as registerCtrl',
        size: size
      });

      modalInstance.result.then(function(register) {
        if(register) {
          basicauth.register(register);
          model.registerUsername = null;
          model.registerEmail = null;
          model.registerPassword = null;
          model.registerVerification = null;
        }
      }, function () {
        //Cancel callback here
      });
    };

  };

  module.controller("NavController", ['GameService', '$routeParams', 'basicauth', 'currentUser', 'growl', 'loginRedirect', 'GameOption', '$modal', NavController]);

}(angular.module("civApp")));

'use strict';
(function (module) {
  var DrawController = function ($log, GameService, DrawService, currentUser, Util, growl, $routeParams, $scope) {
    var model = this;

    $scope.$watch(function () {
      return GameService.getGameById($routeParams.id);
    }, function (newVal) {
      if (!newVal) {
        return;
      }
      var game = newVal;
      model.barbarians = game.player.barbarians;
      model.battlehand = game.player.battlehand;
    });

    var initialize = function() {
      model.user = currentUser.profile;
      model.number = 3;
      if($scope.currentGame.player.barbarians) {
        model.barbarians = $scope.currentGame.player.barbarians;
      } else {
        model.barbarians = [];
      }

      if($scope.currentGame.player.battlehand) {
        model.battlehand = $scope.currentGame.player.battlehand;
      } else {
        model.battlehand = [];
      }
    };

    model.drawUnits = function() {
      $log.info("Draw " + model.number + " units");
      if(model.number < 1) {
        growl.error("You must draw at least 1 unit");
        return;
      }
      DrawService.drawUnitsFromHand($routeParams.id, model.number);
    };

    model.drawBarbarians = function() {
      DrawService.drawBarbarians($routeParams.id);
    };

    model.discardBarbarians = function() {
      DrawService.discardBarbarians($routeParams.id)
        .then(function() {
          model.barbarians = [];
        });
    };

    model.nextElement = function(obj) {
      return Util.nextElement(obj);
    };

    model.revealBattlehand = function() {
      if(model.battlehand && model.battlehand.length > 0) {
        DrawService.revealHand($routeParams.id);
      }
    };

    initialize();
  };

  module.controller("DrawController",
    ["$log", "GameService", "DrawService", "currentUser", "Util", "growl", "$routeParams", "$scope", DrawController]);

}(angular.module("civApp")));

'use strict';
(function (module) {
  var UserItemController = function ($log, $routeParams, GameService, DrawService, currentUser, Util, $filter, ngTableParams, $scope, PlayerService, $modal) {
    var model = this;

    model.nextElement = function(obj) {
      return Util.nextElement(obj);
    };

    model.itemName = function(item) {
      var key = Object.keys(item);
      if(key && key.length > -1) {
        /* jshint ignore:start */
        return _.capitalize(key[0]);
        /* jshint ignore:end */
      }
      return item;
    };

    model.revealItem = function (item) {
      var response = PlayerService.revealItem($routeParams.id, item);
      $log.info("Revealed item, response is " + response);
    };

    model.discardItem = function (item) {
      $log.info("Discard item " + item.name);
      PlayerService.discardItem($routeParams.id, item);
    };

    $scope.$watch(function () {
      return GameService.getGameById($routeParams.id);
    }, function (newVal) {
      if (!newVal) {
        return;
      }
      var game = newVal;
      model.techsChosen = game.player.techsChosen;
      putTechsInScope(model.techsChosen);
      model.civs = [];
      model.cultureCards = [];
      model.greatPersons = [];
      model.huts = [];
      model.villages = [];
      model.tiles = [];
      model.units = [];
      model.items = [];
      readKeysFromItems(game.player.items);
      model.tablePrivateLog.reload();
      return game;
    });

    function readKeysFromItems(items) {
      //TODO refactor to lodash _forEach
      items.forEach(function (item) {
        var itemKey = Object.keys(item)[0];
        if ("cultureI" === itemKey || "cultureII" === itemKey || "cultureIII" === itemKey) {
          model.cultureCards.push(item);
        } else if ("greatperson" === itemKey) {
          model.greatPersons.push(item);
        } else if ("hut" === itemKey) {
          model.huts.push(item);
        } else if ("village" === itemKey) {
          model.villages.push(item);
        } else if ("tile" === itemKey) {
          model.tiles.push(item);
        } else if ("civ" === itemKey) {
          model.civs.push(item);
        } else if ("aircraft" === itemKey || "mounted" === itemKey || "infantry" === itemKey || "artillery" === itemKey) {
          model.units.push(item);
        } else {
          model.items.push(item);
        }
      });
    }

    function putTechsInScope(techs) {
      model.chosenTechs1 = [];
      model.chosenTechs2 = [];
      model.chosenTechs3 = [];
      model.chosenTechs4 = [];
      model.chosenTechs5 = [];
      model.availableTech1 = [];
      model.availableTech2 = [];
      model.availableTech3 = [];
      model.availableTech4 = [];

      //TODO refactor to lodash _forEach
      techs.forEach(function (tech) {
        var chosenTech = tech.tech || tech;
        if(!chosenTech) {
          return;
        }

        if(chosenTech.level === 1) {
          model.chosenTechs1.push(chosenTech);
        } else if(chosenTech.level === 2) {
          model.chosenTechs2.push(chosenTech);
        } else if(chosenTech.level === 3) {
          model.chosenTechs3.push(chosenTech);
        } else if(chosenTech.level === 4) {
          model.chosenTechs4.push(chosenTech);
        } else if(chosenTech.level === 5) {
          model.chosenTechs5.push(chosenTech);
        }
      });

      //Find out how many techs are available for each level
      for(var i = 0; i < (5-model.chosenTechs1.length); i++) {
        model.availableTech1.push(i);
      }
      for(var j = 0; j < (4-model.chosenTechs2.length); j++) {
        model.availableTech2.push(j);
      }
      for(var k = 0; k < (3-model.chosenTechs3.length); k++) {
        model.availableTech3.push(k);
      }
      for(var l = 0; l < (2-model.chosenTechs4.length); l++) {
        model.availableTech4.push(l);
      }
    }

    model.drawItem = function(itemToDraw) {
      if(itemToDraw) {
        DrawService.drawItem($routeParams.id, itemToDraw);
      }
    };

    model.selectTech = function() {
      if($scope.selectedTech.tech) {
        PlayerService.selectTech($routeParams.id, $scope.selectedTech.tech)
          .then(function() {
            GameService.getAvailableTechs($routeParams.id)
              .then(function(techs) {
                model.allAvailableTechs = techs;
              });
          });
      }
    };

    model.removeTech = function(techname) {
      $log.info("Removing tech " + techname);
      PlayerService.removeTech($routeParams.id, techname)
        .then(function() {
          GameService.getAvailableTechs($routeParams.id)
            .then(function(techs) {
              model.allAvailableTechs = techs;
            });
        });
    };

    model.canRevealTech = function(log) {
      return $scope.userHasAccess && log && log.draw && log.draw.hidden && log.log.indexOf("researched") > -1;
    };

    model.revealTechFromLog = function(logid) {
      PlayerService.revealTech($routeParams.id, logid);
    };

    /* jshint ignore:start */
    var getAvailableTechs = GameService.getAvailableTechs($routeParams.id)
      .then(function(techs) {
        model.allAvailableTechs = techs;
      });

    var getChosenTechs = PlayerService.getChosenTechs($routeParams.id)
      .then(function(techs) {
        model.chosenTechs = techs;
        putTechsInScope(model.chosenTechs);
      });
    /* jshint ignore:end */

    var getPlayers = GameService.players($routeParams.id);

    model.openModalTrade = function(size, itemToTrade) {
      if(!itemToTrade) {
        return;
      }

      var modalInstance = $modal.open({
        templateUrl: 'modalTrade.html',
        controller: 'TradeController as tradeCtrl',
        size: size,
        resolve: {
          players: function() {
            return getPlayers;
          },
          item: function () {
            return itemToTrade;
          }

        }
      });

      modalInstance.result.then(function(itemToTrade) {
        PlayerService.trade($routeParams.id, itemToTrade);
      }, function () {
        $log.info('Modal dismissed at: ' + new Date());
      });
    };

    model.openModalLoot = function(size, sheetName) {
      if(!sheetName) {
        return;
      }

      var modalInstance = $modal.open({
        templateUrl: 'modalLoot.html',
        controller: 'LootController as lootCtrl',
        size: size,
        resolve: {
          players: function() {
            return getPlayers;
          },
          sheetName: function () {
            return sheetName;
          }
        }
      });

      modalInstance.result.then(function(loot) {
        DrawService.loot($routeParams.id, loot.sheetName, loot.playerId);
      }, function () {
        $log.info('Modal dismissed at: ' + new Date());
      });
    };

    /* jshint ignore:start */
    model.tablePrivateLog = new ngTableParams({
      page: 1,            // show first page
      count: 10,          // count per page
      sorting: {
        created: 'desc'     // initial sorting
      }
    }, {
      total: 0, // length of data
      getData: function ($defer, params) {
        // use build-in angular filter
        // update table params
        if (!$scope.currentGame) {
          $defer.reject("No game yet");
          return;
        }
        var game = $scope.currentGame;
        var orderedData = params.sorting() ? $filter('orderBy')(game.privateLogs, params.orderBy()) : game.privateLogs;
        params.total(game.privateLogs.length);
        $defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
      },
      $scope: { $data: {}, $emit: function () {}}
    });
    /* jshint ignore:end */

    var initialize = function() {
      model.user = currentUser.profile;
      model.allAvailableTechs = [];
      $scope.privateLogCollapse = false;
      $scope.itemCollapse = false;
      $scope.gpCollapse = false;
      $scope.unitCollapse = false;
      $scope.cultureCardsCollapse = false;
      $scope.civCollapse = false;
      $scope.hutsCollapse = false;
      $scope.villagesCollapse = false;
      $scope.selectedTech = {};
      model.yourTurn = false;
      model.items = [];
      model.techsChosen = [];
      model.civs = [];
      model.cultureCards = [];
      model.greatPersons = [];
      model.huts = [];
      model.villages = [];
      model.tiles = [];
      model.units = [];

      /* jshint ignore:start */
      getAvailableTechs;
      getChosenTechs;
      /* jshint ignore:end */

    };

    initialize();
  };

  module.controller("UserItemController",
    ["$log", "$routeParams", "GameService", "DrawService", "currentUser", "Util", "$filter", "ngTableParams", "$scope", "PlayerService", "$modal", UserItemController]);

}(angular.module("civApp")));

'use strict';
angular.module('civApp').controller('VoteController', ["$scope", "$modalInstance", "$log", "logToUndo", function ($scope, $modalInstance, $log, logToUndo) {
  $scope.voteOk = function () {
    var vote = {
      id: logToUndo.id,
      vote: true
    };
    $modalInstance.close(vote);
  };

  $scope.voteNok = function () {
    var vote = {
      id: logToUndo.id,
      vote: false
    };
    $modalInstance.close(vote);
  };

  $scope.voteCancel = function () {
    $modalInstance.dismiss('cancel');
  };
}]);

'use strict';
angular.module('civApp').controller('RegisterController', ["$scope", "$modalInstance", "$log", "growl", function ($scope, $modalInstance, $log, growl) {
  var model = this;

  //Can also request this from the backend
  model.gameTypes = [
    { label: 'Base Game', value: 'BASE', disabled: true },
    { label: 'Fame and Fortune (FAF)', value: 'FAF', disabled: true },
    { label: 'Wisdom and Warfare (WAW) & Fame and Fortune', value: 'WAW', disabled: false },
    { label: 'Dawn of Civilization', value: 'DOC', disabled: true }
  ];

  model.selectedGametype = model.gameTypes[2];

  $scope.createGameOk = function() {
    if(model.selectedGametype && model.selectedGametype.value !== 'WAW') {
      growl.error('We only support Wisdom and Warfare the time being');
      return;
    }

    var createNewGame = {
      'name' : model.gamename,
      'type' : model.selectedGametype.value,
      'numOfPlayers' : model.numOfPlayers,
      'color' : model.color
    };

    $modalInstance.close(createNewGame);
  };

  $scope.registerOk = function() {
    if(!$scope.verification || !$scope.password && $scope.password !== $scope.verification) {
      growl.error("Passwords did not match");
      return;
    }

    if(!$scope.securityQuestion || $scope.securityQuestion.toUpperCase() !== "WRITING") {
      growl.error('Wrong answer to the security question');
      return;
    }

    var register = {
      'username' : model.registerUsername,
      'email' : model.registerEmail,
      'password' : $scope.password
    };

    $modalInstance.close(register);
  };

  $scope.registerCancel = function () {
    $modalInstance.dismiss('cancel');
  };
}]);

'use strict';
(function (module) {
  var ChatController = function (chatList, $log, currentUser, GameService, growl, $routeParams, $scope) {
    var model = this;

    model.chat = function() {
      if(model.chatMessage) {
        GameService.chat($routeParams.id, model.chatMessage)
          .then(function (data) {
            var newChat = data;
            if (newChat) {
              newChat.message = data.message;
              $scope.chatList.unshift(newChat);
              model.chatMessage = "";
            }
          });
      }
    };

    var init = function() {
      $scope.chatList = chatList;
    };

    init();

  };

  module.controller("ChatController",
    ["chatList", "$log", "currentUser", "GameService", "growl", "$routeParams", "$scope", ChatController]);

}(angular.module("civApp")));

'use strict';
angular.module('civApp').controller('TradeController', ["players", "item", "currentUser", "$scope", "$modalInstance", function (players, item, currentUser, $scope, $modalInstance) {
  var model = this;
  model.players = players;
  model.item = item;

  model.ok = function() {
    item.ownerId = model.playerTradeChosen.playerId;
    $modalInstance.close(item);
  };

  model.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
}]);

'use strict';
angular.module('civApp').controller('LootController', ["players", "sheetName", "currentUser", "$scope", "$modalInstance", function (players, sheetName, currentUser, $scope, $modalInstance) {
  var model = this;
  model.players = players;
  model.sheetName = sheetName;

  model.ok = function() {
    $modalInstance.close({
      playerId: model.playerLootChosen.playerId,
      sheetName: sheetName
    });
  };

  model.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
}]);
