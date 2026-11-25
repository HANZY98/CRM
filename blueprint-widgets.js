(function () {
  var blueprintRecord = { Entity: null, RecordID: null };
  var cachedWorkflowOrder = null;
  var workflowOrderPromise = null;

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

  ZOHO.embeddedApp.on("PageLoad", function (data) {
    blueprintRecord.Entity = data.Entity;
    blueprintRecord.RecordID = data.EntityId;
  });

  window.previousBlueprintState = function previousBlueprintState() {
    if (!blueprintRecord.Entity || !blueprintRecord.RecordID) {
      alert(
        "This page is not linked to a CRM record yet. Open it from a Blueprint transition."
      );
      return;
    }

    ZOHO.CRM.API.getBluePrint({
      Entity: blueprintRecord.Entity,
      RecordID: blueprintRecord.RecordID,
    })
      .then(function (blueprintResponse) {
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
})();