package signaling

import (
	"net/url"
	"strings"
)

type originPolicy struct {
	exact map[string]struct{}
	hosts map[string]map[string]struct{}
}

func newOriginPolicy(origins []string) originPolicy {
	policy := originPolicy{
		exact: make(map[string]struct{}),
		hosts: make(map[string]map[string]struct{}),
	}

	for _, raw := range origins {
		origin := strings.TrimSpace(raw)
		if origin == "" {
			continue
		}

		u, err := url.Parse(origin)
		if err != nil {
			continue
		}
		if u.Scheme == "" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			continue
		}

		scheme := strings.ToLower(u.Scheme)
		host := strings.ToLower(u.Host)
		hostname := strings.ToLower(u.Hostname())

		if _, ok := policy.hosts[scheme]; !ok {
			policy.hosts[scheme] = make(map[string]struct{})
		}

		if port := u.Port(); port != "" {
			policy.exact[scheme+"://"+host] = struct{}{}
			continue
		}

		policy.hosts[scheme][hostname] = struct{}{}
		policy.exact[scheme+"://"+hostname] = struct{}{}
	}

	return policy
}

func (p originPolicy) allows(origin string) bool {
	if origin == "" {
		return false
	}

	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Scheme == "" || u.Host == "" {
		return false
	}

	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Host)
	key := scheme + "://" + host
	if _, ok := p.exact[key]; ok {
		return true
	}

	hostname := strings.ToLower(u.Hostname())
	if allowedHosts, ok := p.hosts[scheme]; ok {
		if _, ok := allowedHosts[hostname]; ok {
			return true
		}
	}

	return false
}
