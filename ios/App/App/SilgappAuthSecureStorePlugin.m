#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor 5 registration, matching the installed Preferences plugin pattern.
CAP_PLUGIN(SilgappAuthSecureStorePlugin, "SilgappAuthSecureStore",
           CAP_PLUGIN_METHOD(setPending, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getPending, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(removePending, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(clearPending, CAPPluginReturnPromise);
)
