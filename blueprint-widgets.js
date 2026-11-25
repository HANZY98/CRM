(function () {
  var blueprintRecord = { Entity: null, RecordID: null };
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
    return window.BLUEPRINT_CONFIG || { defaultModule: "Leads" };
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

  function findRecordIdInObject(value, depth) {
    if (value == null || depth > 6) {
      return null;
    }

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var fromArray = findRecordIdInObject(value[i], depth + 1);
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
        if (/entity.?id|record.?id/i.test(key)) {
          var id = parseRecordId(value[key]);
          if (id) {
            return id;
          }
        }
        var fromChild = findRecordIdInObject(value[key], depth + 1);
        if (fromChild) {
          return fromChild;
        }
      }
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
      var fromReferrer = parseRecordFromCrmUrl(document.referrer || "");
      if (fromReferrer) {
        blueprintRecord.Entity = blueprintRecord.Entity || fromReferrer.Entity;
        blueprintRecord.RecordID =
          blueprintRecord.RecordID || fromReferrer.RecordID;
      }
    }

    if (!hasRecordContext()) {
      var discoveredId = findRecordIdInObject(data, 0);
      if (discoveredId) {
        blueprintRecord.RecordID = discoveredId;
        blueprintRecord.Entity =
          blueprintRecord.Entity || blueprintConfig().defaultModule || "Leads";
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

  window.captureBlueprintPageContext = captureBlueprintPageContext;
  window.getBlueprintRecordContext = function () {
    return blueprintRecord;
  };

  window.initializeBlueprintWidget = function initializeBlueprintWidget() {
    ensureSdkInitialized();
  };

  ZOHO.embeddedApp.on("PageLoad", function (data) {
    captureBlueprintPageContext(data);
  });
})();