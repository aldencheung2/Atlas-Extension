//Listener for fetching websites
chrome.runtime.onMessage.addListener(
    function(request, sender, resultsReturner) {
        fetch(request.link)
            .then(response => response.text())
            .then(response => resultsReturner(response))
            .catch(error => console.log(error))
        return true;
    }
);


// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//     const item = msg.item;

//     // Asynchronously process your "item", but DON'T return the promise
//     asyncOperation().then(() => {
//       // telling that CS has finished its job
//       sendResponse({complete: true});
//     });

//     // return true from the event listener to indicate you wish to send a response asynchronously
//     // (this will keep the message channel open to the other end until sendResponse is called).
//     return true;
// });