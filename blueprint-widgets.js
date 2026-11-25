(function () {
  var blueprintRecord = { Entity: null, RecordID: null };
  var cachedWorkflowOrder = null;
  var workflowOrderPromise = null;
  var blueprintInitPromise = null;
  var pageLoadHandlers = [];

  if (window.ZOHO && ZOHO.embeddedApp && !ZOHO.embeddedApp.__blueprintPageLoadPatched) {
    var originalOn = ZOHO.embeddedApp.on.bind(ZOHO.embeddedApp);
    ZOHO.embeddedApp.__blueprintPageLoadPatched = true;
    ZOHO.embeddedApp.on = function (event, handler) {
      if (event !== "PageLoad") {
        originalOn(event, handler);
        return;
      }
      pageLoadHandlers.push(handler);
      if (pageLoadHandlers.length === 1) {
        originalOn("PageLoad", function (data) {
          pageLoadHandlers.forEach(function (fn) {
            try {
              fn(data);
            } catch (error) {
              console.error("PageLoad handler failed", error);
            }
          });
        });
      }
    };
  }

  function blueprintConfig() {
    return window.BLUEPRINT_CONFIG || {};
  }

  function normalizeStateName(name) {
    return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function workflowOrder() {
    if (cachedWorkflowOrder && cachedWorkflowOrder.length) {
      return cachedWorkflowOrder.slice();
    }
    return (
      (window.BLUEPRINT_WORKFLOW_ORDER &&
        window.BLUEPRINT_WORKFLOW_ORDER.slice()) ||
      []
    );
  }

  function parseHttpBody(response) {
    var body = response;
    if (response && typeof response === "object" && "response" in response) {
      body = response.response;
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch (error) {
        console.warn("Could not parse HTTP response JSON", error);
        return null;
      }
    }
    return body;
  }

  function crmHttpGet(pathWithQuery) {
    return ZOHO.CRM.HTTP.get({
      url: "https://www.zohoapis.com/crm/v8/" + pathWithQuery,
    }).then(parseHttpBody);
  }

  function stateLabel(state) {
    if (!state) {
      return "";
    }
    if (state.pick_list_value && state.pick_list_value.actual_value) {
      return state.pick_list_value.actual_value;
    }
    if (state.name) {
      return state.name;
    }
    return "";
  }

  function buildWorkflowOrderFromBlueprintDetail(detail) {
    var blueprint =
      (detail &&
        detail.blueprints &&
        detail.blueprints[0]) ||
      detail;

    if (!blueprint) {
      return [];
    }

    var nodes =
      blueprint.chart_data && blueprint.chart_data.nodes
        ? blueprint.chart_data.nodes.slice()
        : [];

    if (nodes.length) {
      nodes.sort(function (a, b) {
        var xDiff = (a.position_x || 0) - (b.position_x || 0);
        if (xDiff !== 0) {
          return xDiff;
        }
        return (a.position_y || 0) - (b.position_y || 0);
      });

      var fromNodes = nodes
        .map(function (node) {
          return stateLabel(node.state);
        })
        .filter(Boolean);

      if (fromNodes.length) {
        return fromNodes;
      }
    }

    var states = blueprint.states || [];
    return states
      .map(function (state) {
        return stateLabel(state);
      })
      .filter(Boolean);
  }

  function findBlueprintSummary(listResponse, processName) {
    var blueprints = (listResponse && listResponse.blueprints) || [];
    var target = normalizeStateName(processName);

    for (var i = 0; i < blueprints.length; i++) {
      if (normalizeStateName(blueprints[i].name) === target) {
        return blueprints[i];
      }
    }
    return null;
  }

  function ensureWorkflowOrder(moduleApiName, processName) {
    if (cachedWorkflowOrder && cachedWorkflowOrder.length) {
      return Promise.resolve(cachedWorkflowOrder);
    }
    if (workflowOrderPromise) {
      return workflowOrderPromise;
    }

    var module = moduleApiName || "Leads";
    var lookupName =
      processName ||
      blueprintConfig().processName ||
      "Admissions New";

    workflowOrderPromise = crmHttpGet(
      "settings/blueprints?module=" +
        encodeURIComponent(module) +
        "&status=Active"
    )
      .then(function (listResponse) {
        var summary = findBlueprintSummary(listResponse, lookupName);
        if (!summary || !summary.id) {
          throw new Error('Blueprint "' + lookupName + '" was not found.');
        }
        return crmHttpGet(
          "settings/blueprints/" +
            encodeURIComponent(summary.id) +
            "?include=state,transition"
        );
      })
      .then(function (detailResponse) {
        var order = buildWorkflowOrderFromBlueprintDetail(detailResponse);
        if (!order.length) {
          throw new Error("Blueprint has no readable states.");
        }
        cachedWorkflowOrder = order;
        console.log("Loaded workflow order from Zoho:", order);
        return order;
      })
      .catch(function (error) {
        console.warn(
          "Using fallback workflow-order.js list:",
          error && error.message ? error.message : error
        );
        cachedWorkflowOrder = workflowOrder();
        return cachedWorkflowOrder;
      })
      .finally(function () {
        workflowOrderPromise = null;
      });

    return workflowOrderPromise;
  }

  function resolveWorkflowIndex(currentStateName) {
    var order = workflowOrder();
    var normalizedCurrent = normalizeStateName(currentStateName);
    for (var i = 0; i < order.length; i++) {
      if (normalizeStateName(order[i]) === normalizedCurrent) {
        return i;
      }
    }
    return -1;
  }

  function getPreviousStateName(currentStateName) {
    var index = resolveWorkflowIndex(currentStateName);
    if (index <= 0) {
      return null;
    }
    return workflowOrder()[index - 1];
  }

  function collectTransitions(blueprintResponse) {
    var collected = [];
    var transitions =
      (blueprintResponse &&
        blueprintResponse.blueprint &&
        blueprintResponse.blueprint.transitions) ||
      [];

    transitions.forEach(function (transition) {
      collected.push(transition);
      (transition.next_transitions || []).forEach(function (child) {
        collected.push(child);
      });
    });

    return collected;
  }

  function findTransitionToState(blueprintResponse, targetStateName) {
    var target = normalizeStateName(targetStateName);
    var transitions = collectTransitions(blueprintResponse);
    var matchByDestination = null;
    var matchByPreviousStateName = null;

    for (var i = 0; i < transitions.length; i++) {
      var transition = transitions[i];
      if (!transition || !transition.id) {
        continue;
      }

      if (normalizeStateName(transition.next_field_value) === target) {
        matchByDestination = transition;
        break;
      }

      if (
        normalizeStateName(transition.name) === "previous state" &&
        !matchByPreviousStateName
      ) {
        matchByPreviousStateName = transition;
      }
    }

    return matchByDestination || matchByPreviousStateName;
  }

  function runBlueprintTransition(transitionId) {
    return ZOHO.CRM.API.updateBluePrint({
      Entity: blueprintRecord.Entity,
      RecordID: blueprintRecord.RecordID,
      BlueprintData: {
        blueprint: [
          {
            transition_id: transitionId,
            data: {},
          },
        ],
      },
    });
  }

  function hasRecordContext() {
    return !!(blueprintRecord.Entity && blueprintRecord.RecordID);
  }

  function parseRecordId(value) {
    if (value == null || value === "") {
      return "";
    }
    if (Array.isArray(value)) {
      return parseRecordId(value[0]);
    }
    if (typeof value === "object" && value.id != null) {
      return String(value.id);
    }
    return String(value);
  }

  function parseRecordFromCrmUrl(urlString) {
    if (!urlString) {
      return null;
    }
    var patterns = [
      /\/tab\/([^/?#]+)\/(\d{10,})/i,
      /\/crm\/(?:[^/?#]+\/){0,5}([^/?#]+)\/(\d{10,})/i,
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = String(urlString).match(patterns[i]);
      if (match) {
        return {
          Entity: decodeURIComponent(match[1]),
          RecordID: match[2],
        };
      }
    }
    return null;
  }

  function parseRecordFromReferrer() {
    return parseRecordFromCrmUrl(document.referrer || "");
  }

  function findRecordIdInObject(value, depth, keyHint) {
    if (value == null || depth > 6) {
      return null;
    }

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var fromArray = findRecordIdInObject(value[i], depth + 1, keyHint);
        if (fromArray) {
          return fromArray;
        }
      }
      return null;
    }

    if (typeof value === "object") {
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          continue;
        }
        var nested = value[key];
        if (/entity.?id|record.?id/i.test(key)) {
          var id = parseRecordId(nested);
          if (id) {
            return id;
          }
        }
        var fromChild = findRecordIdInObject(nested, depth + 1, key);
        if (fromChild) {
          return fromChild;
        }
      }
      return null;
    }

    if (
      typeof value === "string" &&
      /^\d{10,20}$/.test(value) &&
      keyHint &&
      /entity|record|id/i.test(keyHint)
    ) {
      return value;
    }

    return null;
  }

  function triggerCrmEvent(payload) {
    if (typeof self._getAppSDK !== "function") {
      return Promise.reject(new Error("Zoho SDK is not ready."));
    }
    var sdk = self._getAppSDK();
    payload.sdkVersion = "1.5";
    return sdk.getContext().Event.Trigger("CRM_EVENT", payload, true);
  }

  function resolveRecordFromParentUrl() {
    return triggerCrmEvent({ category: "GET_PARENT_URL" })
      .then(function (response) {
        var parentUrl =
          (response && response.data) ||
          (response && response.url) ||
          (typeof response === "string" ? response : "");
        var parsed = parseRecordFromCrmUrl(parentUrl);
        if (!parsed) {
          return null;
        }
        blueprintRecord.Entity = blueprintRecord.Entity || parsed.Entity;
        blueprintRecord.RecordID =
          blueprintRecord.RecordID || parsed.RecordID;
        return blueprintRecord;
      })
      .catch(function (error) {
        console.warn("Could not read parent CRM URL", error);
        return null;
      });
  }

  function parseRecordFromWidgetUrl() {
    var search = window.location.search || "";
    if (!search) {
      return null;
    }

    var params = new URLSearchParams(search);
    var recordId =
      params.get("recordId") ||
      params.get("recordID") ||
      params.get("EntityId") ||
      params.get("entityId") ||
      params.get("id");
    var entity =
      params.get("Entity") ||
      params.get("module") ||
      params.get("entity") ||
      blueprintConfig().defaultModule ||
      "Leads";

    recordId = parseRecordId(recordId);
    if (!recordId) {
      return null;
    }

    return { Entity: entity, RecordID: recordId };
  }

  function captureBlueprintPageContext(data) {
    if (!data || typeof data !== "object") {
      return;
    }

    window.__blueprintPageLoadData = data;

    var entity =
      data.Entity ||
      data.entity ||
      data.Module ||
      data.module ||
      data.EntityName;
    var recordId =
      data.EntityId ||
      data.EntityID ||
      data.entityId ||
      data.RecordID ||
      data.RecordId ||
      data.record_id ||
      data.recordId ||
      data.id;

    recordId = parseRecordId(recordId);

    if (!entity && blueprintConfig().defaultModule) {
      entity = blueprintConfig().defaultModule;
    }

    if (entity) {
      blueprintRecord.Entity = entity;
    }
    if (recordId) {
      blueprintRecord.RecordID = recordId;
    }

    if (!hasRecordContext()) {
      var fromReferrer = parseRecordFromReferrer();
      if (fromReferrer) {
        blueprintRecord.Entity = blueprintRecord.Entity || fromReferrer.Entity;
        blueprintRecord.RecordID =
          blueprintRecord.RecordID || fromReferrer.RecordID;
      }
    }

    if (!hasRecordContext()) {
      var fromUrl = parseRecordFromWidgetUrl();
      if (fromUrl) {
        blueprintRecord.Entity = blueprintRecord.Entity || fromUrl.Entity;
        blueprintRecord.RecordID =
          blueprintRecord.RecordID || fromUrl.RecordID;
      }
    }

    if (!hasRecordContext()) {
      var discoveredId = findRecordIdInObject(data, 0, "root");
      if (discoveredId) {
        blueprintRecord.RecordID = discoveredId;
        blueprintRecord.Entity =
          blueprintRecord.Entity ||
          data.Entity ||
          blueprintConfig().defaultModule ||
          "Leads";
      }
    }

    console.log("Blueprint record context", blueprintRecord, data);
  }

  function ensureSdkInitialized() {
    if (!blueprintInitPromise) {
      blueprintInitPromise = ZOHO.embeddedApp.init().then(function () {
        return resolveRecordFromParentUrl();
      });
    }
    return blueprintInitPromise;
  }

  function ensureRecordContext() {
    return ensureSdkInitialized()
      .then(function () {
        if (hasRecordContext()) {
          return blueprintRecord;
        }

        if (window.__blueprintPageLoadData) {
          captureBlueprintPageContext(window.__blueprintPageLoadData);
        }

        if (hasRecordContext()) {
          return blueprintRecord;
        }

        var fromReferrer = parseRecordFromReferrer();
        if (fromReferrer) {
          blueprintRecord.Entity = fromReferrer.Entity;
          blueprintRecord.RecordID = fromReferrer.RecordID;
          return blueprintRecord;
        }

        return new Promise(function (resolve, reject) {
          var attempts = 0;
          var maxAttempts = 40;
          var intervalMs = 250;

          var timer = setInterval(function () {
            attempts += 1;

            if (window.__blueprintPageLoadData) {
              captureBlueprintPageContext(window.__blueprintPageLoadData);
            }

            if (hasRecordContext()) {
              clearInterval(timer);
              resolve(blueprintRecord);
              return;
            }

            if (attempts >= maxAttempts) {
              clearInterval(timer);
              reject(
                new Error("Blueprint record context was not provided by CRM.")
              );
            }
          }, intervalMs);
        });
      })
      .then(function (record) {
        if (!hasRecordContext()) {
          throw new Error("Blueprint record context was not provided by CRM.");
        }
        return record || blueprintRecord;
      });
  }

  window.captureBlueprintPageContext = captureBlueprintPageContext;

  window.initializeBlueprintWidget = function initializeBlueprintWidget() {
    ensureSdkInitialized();
  };

  ZOHO.embeddedApp.on("PageLoad", function (data) {
    captureBlueprintPageContext(data);
  });

  window.previousBlueprintState = function previousBlueprintState() {
    ensureRecordContext()
      .catch(function () {
        alert(
          "This page is not linked to a CRM record yet. Open it from a Blueprint transition on a lead."
        );
        return null;
      })
      .then(function (context) {
        if (!context) {
          return null;
        }

        return ZOHO.CRM.API.getBluePrint({
          Entity: blueprintRecord.Entity,
          RecordID: blueprintRecord.RecordID,
        });
      })
      .then(function (blueprintResponse) {
        if (!blueprintResponse) {
          return null;
        }

        var processInfo =
          blueprintResponse &&
          blueprintResponse.blueprint &&
          blueprintResponse.blueprint.process_info;
        var currentState = (processInfo && processInfo.field_value) || "";
        var processName =
          (processInfo && processInfo.name) ||
          blueprintConfig().processName ||
          "Admissions New";

        if (!currentState) {
          alert("Could not read the current Blueprint stage for this record.");
          return null;
        }

        return ensureWorkflowOrder(blueprintRecord.Entity, processName).then(
          function () {
            var previousState = getPreviousStateName(currentState);
            if (!previousState) {
              if (resolveWorkflowIndex(currentState) === -1) {
                alert(
                  'Current stage "' +
                    currentState +
                    '" was not found in the Admissions New workflow order.'
                );
              } else {
                alert("This record is already on the first stage in the process.");
              }
              return null;
            }

            var transition = findTransitionToState(
              blueprintResponse,
              previousState
            );
            if (!transition) {
              var destinations = collectTransitions(blueprintResponse)
                .map(function (t) {
                  return t.next_field_value || t.name;
                })
                .filter(Boolean)
                .join(", ");

              alert(
                'No transition to "' +
                  previousState +
                  '" is available from "' +
                  currentState +
                  '".\n\nAdd a back transition in Blueprint to "' +
                  previousState +
                  '".\n\nTransitions available now: ' +
                  (destinations || "none")
              );
              return null;
            }

            return runBlueprintTransition(transition.id);
          }
        );
      })
      .then(function (response) {
        if (!response) {
          return;
        }
        console.log("Moved one Blueprint stage back", response);
      })
      .catch(function (error) {
        console.error("Previous state transition failed", error);
        alert(
          "Could not move one stage back. Check the back transition in Blueprint and any required fields."
        );
      });
  };

  window.addEventListener(
    "message",
    function (event) {
      if (!event || !event.data) {
        return;
      }
      var payload = event.data;
      try {
        if (typeof payload === "string") {
          payload = JSON.parse(payload);
        }
      } catch (error) {
        return;
      }
      if (payload && payload.data && typeof payload.data === "object") {
        captureBlueprintPageContext(payload.data);
      }
    },
    false
  );
})();